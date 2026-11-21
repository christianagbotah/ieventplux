import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errors, handle, jsonOk, readJson, requireUser, sanitizeText, rateLimit, pagination, jsonList } from '@/server/api'
import { getMeetingAccess, meetingIceServers, requireMeetingFeature } from '@/server/meeting-service'
import { MEETING_MAX_MESSAGE, validMeetingCapacity } from '@/server/meeting-policy'
import { realtimeEmit } from '@/server/services/realtime'

type Context = { params: Promise<{ id: string; action: string }> }

/** Meeting metadata + chat history; never give uninvited users participant data. */
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    requireMeetingFeature()
    const { id, action } = await ctx.params
    const user = await requireUser()
    const { meeting, organizer, canJoin } = await getMeetingAccess(id, user.id)
    if (action === 'detail') {
      const removedParticipants = organizer
        ? await db.meetingBan.findMany({
            where: { meetingId: id },
            select: { userId: true, user: { select: { displayName: true } }, createdAt: true },
            orderBy: { createdAt: 'desc' },
          }) : []
      const response = jsonOk({
        meeting: {
          id: meeting.id, title: meeting.title, status: meeting.status,
          maxParticipants: meeting.maxParticipants,
          chatEnabled: meeting.chatEnabled, screenShareEnabled: meeting.screenShareEnabled,
          startedAt: meeting.startedAt, endedAt: meeting.endedAt,
          event: { id: meeting.event.id, title: meeting.event.title, slug: meeting.event.slug, orgName: meeting.event.org.name },
        },
        access: { canManage: organizer, canJoin },
        removedParticipants,
        iceServers: canJoin ? meetingIceServers(user.id) : [],
      })
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    if (action === 'chat') {
      const { page, pageSize, offset } = pagination(req, 40, 80)
      const where = { meetingId: id, ...(organizer ? {} : { status: 'VISIBLE' }) }
      const [messages, total] = await Promise.all([
        db.meetingMessage.findMany({
          where, include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: offset, take: pageSize,
        }),
        db.meetingMessage.count({ where }),
      ])
      const response = jsonList(messages.reverse(), total, page, pageSize)
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    throw errors.notFound('Unknown meeting resource.')
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    requireMeetingFeature()
    const { id, action } = await ctx.params
    const user = await requireUser()
    const { meeting, organizer, canJoin } = await getMeetingAccess(id, user.id)
    if (['start', 'end', 'settings', 'moderate', 'remove-participant', 'restore-participant'].includes(action) && !organizer) {
      throw errors.forbidden('Only event organizers can control or moderate this meeting.')
    }
    const body: Record<string, unknown> = await readJson<Record<string, unknown>>(req).catch(() => ({} as Record<string, unknown>))
    if (action === 'start') {
      await rateLimit(req, 'meeting-start', 10, 60_000)
      if (meeting.status === 'LIVE') return jsonOk({ status: 'LIVE' })
      const updated = await db.eventMeeting.updateMany({
        where: { id, status: { in: ['SCHEDULED', 'ENDED'] } },
        data: { status: 'LIVE', startedAt: new Date(), endedAt: null },
      })
      if (!updated.count) throw errors.conflict('Meeting state changed. Refresh the room.')
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'meeting.start', entityType: 'EventMeeting', entityId: id })
      return jsonOk({ status: 'LIVE' })
    }
    if (action === 'end') {
      await rateLimit(req, 'meeting-end', 10, 60_000)
      const updated = await db.eventMeeting.updateMany({
        where: { id, status: 'LIVE' }, data: { status: 'ENDED', endedAt: new Date() },
      })
      if (!updated.count) throw errors.conflict('This meeting is no longer live.')
      await realtimeEmit(`meeting:${id}`, 'meeting:ended', { meetingId: id })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'meeting.end', entityType: 'EventMeeting', entityId: id })
      return jsonOk({ status: 'ENDED' })
    }
    if (action === 'settings') {
      if (meeting.status === 'LIVE') throw errors.conflict('End the meeting before changing settings.')
      const maxParticipants = validMeetingCapacity(body.maxParticipants ?? meeting.maxParticipants)
      if (maxParticipants === null) throw errors.badRequest('Choose 2–6 participants.')
      const title = sanitizeText(body.title ?? meeting.title, 120)
      if (!title) throw errors.badRequest('A meeting title is required.')
      const updated = await db.eventMeeting.update({
        where: { id },
        data: {
          title, maxParticipants,
          chatEnabled: body.chatEnabled === undefined ? meeting.chatEnabled : body.chatEnabled === true,
          screenShareEnabled: body.screenShareEnabled === undefined ? meeting.screenShareEnabled : body.screenShareEnabled === true,
        },
      })
      return jsonOk({ meeting: updated })
    }
    if (action === 'chat') {
      await rateLimit(req, 'meeting-chat', 15, 60_000)
      // The event group chat remains available to approved attendees before
      // and after a call. Video admission is separately restricted to LIVE.
      if (!meeting.chatEnabled) throw errors.conflict('The event organizer has disabled group chat.')
      const text = sanitizeText(body.body, MEETING_MAX_MESSAGE)
      if (!text.trim()) throw errors.badRequest('Write a message before sending.')
      const record = await db.meetingMessage.create({
        data: { meetingId: id, userId: user.id, body: text },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      })
      await realtimeEmit(`meeting:${id}`, 'meeting:chat', record)
      return jsonOk({ message: record }, { status: 201 })
    }
    if (action === 'remove-participant' || action === 'restore-participant') {
      await rateLimit(req, 'meeting-participant-control', 20, 60_000)
      const targetId = String(body.userId ?? '')
      if (!targetId || targetId === user.id) throw errors.badRequest('Select another participant.')
      const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } })
      if (!target) throw errors.notFound('Participant not found.')
      if (action === 'remove-participant') {
        const host = await db.event.findUnique({
          where: { id: meeting.eventId }, select: { org: { select: { ownerId: true } } },
        })
        const membership = await (await import('@/server/permissions')).eventOrgAccess(targetId, meeting.eventId, 'broadcast:manage')
        if (membership.allowed || host?.org.ownerId === targetId) {
          throw errors.forbidden('Event hosts cannot be removed through participant moderation.')
        }
        await db.meetingBan.upsert({
          where: { meetingId_userId: { meetingId: id, userId: targetId } },
          create: { meetingId: id, userId: targetId, removedById: user.id },
          update: { removedById: user.id },
        })
        await realtimeEmit(`meeting:${id}`, 'meeting:remove', { userId: targetId })
      } else {
        await db.meetingBan.deleteMany({ where: { meetingId: id, userId: targetId } })
      }
      const { audit } = await import('@/server/audit')
      await audit({
        actorUserId: user.id, actorLabel: user.email,
        action: action === 'remove-participant' ? 'meeting.participant_remove' : 'meeting.participant_restore',
        entityType: 'EventMeeting', entityId: id,
        after: JSON.stringify({ targetUserId: targetId }),
      })
      return jsonOk({ userId: targetId, removed: action === 'remove-participant' })
    }

    if (action === 'moderate') {
      await rateLimit(req, 'meeting-moderate', 30, 60_000)
      const messageId = String(body.messageId ?? '')
      const status = body.status === 'HIDDEN' ? 'HIDDEN' : body.status === 'VISIBLE' ? 'VISIBLE' : null
      if (!status || !messageId) throw errors.badRequest('Invalid moderation action.')
      const updated = await db.meetingMessage.updateMany({
        where: { id: messageId, meetingId: id }, data: { status },
      })
      if (!updated.count) throw errors.notFound('Message not found.')
      await realtimeEmit(`meeting:${id}`, 'meeting:moderated', { id: messageId, status })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'meeting.chat_moderate', entityType: 'MeetingMessage', entityId: messageId })
      return jsonOk({ id: messageId, status })
    }
    throw errors.notFound('Unknown meeting action.')
  })
}
