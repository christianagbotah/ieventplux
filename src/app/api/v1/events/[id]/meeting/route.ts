import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errors, handle, jsonOk, readJson, requireUser, sanitizeText } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { meetingFeatureEnabled, getMeetingAccess, requireMeetingFeature } from '@/server/meeting-service'
import { meetingEventUsable, validMeetingCapacity } from '@/server/meeting-policy'

type Context = { params: Promise<{ id: string }> }

/** One independently managed, authenticated group meeting per event. */
export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    if (!meetingFeatureEnabled()) return jsonOk({ enabled: false, meeting: null, canManage: false })
    const event = await db.event.findUnique({ where: { id }, select: { id: true, orgId: true, status: true, deletedAt: true, org: { select: { ownerId: true, status: true, deletedAt: true } } } })
    if (!event || !meetingEventUsable(event)) throw errors.notFound('Event unavailable.')
    const access = await eventOrgAccess(user.id, id, 'broadcast:manage')
    const meeting = await db.eventMeeting.findUnique({ where: { eventId: id } })
    if (meeting) {
      const participant = await getMeetingAccess(meeting.id, user.id)
      const response = jsonOk({ enabled: true, canManage: participant.organizer, meeting: {
        id: meeting.id, title: meeting.title, status: meeting.status,
        maxParticipants: meeting.maxParticipants, chatEnabled: meeting.chatEnabled,
        screenShareEnabled: meeting.screenShareEnabled, startedAt: meeting.startedAt,
      } })
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    if (!access.allowed && event.org.ownerId !== user.id) return jsonOk({ enabled: true, meeting: null, canManage: false })
    return jsonOk({ enabled: true, meeting: null, canManage: true })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    requireMeetingFeature()
    const { id } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'broadcast:manage')
    if (!access.event) throw errors.notFound('Event not found.')
    // Organization owners may not have a duplicate accepted membership row.
    const isOwner = Boolean(await db.organization.findFirst({ where: { id: access.event.orgId, ownerId: user.id, status: 'ACTIVE', deletedAt: null }, select: { id: true } }))
    if (!access.allowed && !isOwner) throw errors.forbidden('Only an event organizer may create its meeting.')
    const event = await db.event.findUnique({
      where: { id }, select: { title: true, status: true, deletedAt: true, org: { select: { status: true, deletedAt: true } } },
    })
    if (!event || !meetingEventUsable(event)) throw errors.conflict('Publish the event and activate its organizer before creating a meeting.')
    const body = await readJson<Record<string, unknown>>(req)
    const capacity = validMeetingCapacity(body.maxParticipants ?? 6)
    if (capacity === null) throw errors.badRequest('A small-group meeting accepts 2–6 participants.')
    const title = sanitizeText(body.title, 120) || `${event.title} — Group meeting`
    const existing = await db.eventMeeting.findUnique({ where: { eventId: id }, select: { id: true } })
    if (existing) throw errors.conflict('This event already has a meeting. Use its settings instead.')
    const meeting = await db.eventMeeting.create({
      data: {
        eventId: id, title, maxParticipants: capacity,
        chatEnabled: body.chatEnabled !== false, screenShareEnabled: body.screenShareEnabled !== false,
        createdById: user.id,
      },
    })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'meeting.create', entityType: 'EventMeeting', entityId: meeting.id })
    return jsonOk({ meeting }, { status: 201 })
  })
}
