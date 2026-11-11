import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText, parseTags } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/v1/events/[id] — id may be the slug or the internal id. */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const event = await db.event.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      include: {
        org: { select: { id: true, name: true, slug: true, tagline: true, logoUrl: true, verifiedAt: true, orgType: true } },
        venue: true,
        series: true,
        agenda: { orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] },
        ticketTypes: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        media: { where: { kind: { in: ['GALLERY', 'CLIP'] } } },
        updates: { orderBy: { createdAt: 'desc' }, take: 10 },
        broadcasts: true,
      },
    })
    if (!event || event.deletedAt) throw errors.notFound('Event not found.')

    // Visibility rules: unlisted/invite-only events are reachable only by direct link.
    // INVITE_ONLY additionally hides location details from anonymous users.
    const session = await getSession()
    const isOrgMember = session
      ? await db.membership.findFirst({ where: { userId: session.user.id, orgId: event.orgId } })
      : null

    const followStats = await db.follow.count({ where: { orgId: event.orgId } })
    const interested = await db.eventInterest.count({ where: { eventId: event.id, kind: 'GOING' } })
    const comments = await db.comment.count({ where: { eventId: event.id, status: 'VISIBLE' } })

    const mine = session
      ? {
          saved: Boolean(await db.eventInterest.findFirst({ where: { userId: session.user.id, eventId: event.id, kind: 'SAVE' } })),
          going: Boolean(await db.eventInterest.findFirst({ where: { userId: session.user.id, eventId: event.id, kind: 'GOING' } })),
          following: Boolean(await db.follow.findFirst({ where: { userId: session.user.id, orgId: event.orgId } })),
        }
      : { saved: false, going: false, following: false }

    const venue = event.venue
    const venueSafe = venue
      ? {
          ...venue,
          // Full address stays private for invitation-only events until the invitation is approved.
          address: event.visibility === 'INVITE_ONLY' && !isOrgMember && !mine.going ? 'Address shared with approved guests' : venue.address,
        }
      : null

    return jsonOk({
      event: {
        ...event,
        tags: parseTags(event.tags),
        gallery: event.media.map((m) => ({ id: m.id, url: m.url, caption: m.caption })),
        venue: venueSafe,
        feeNote: event.ticketTypes.some((t) => t.priceMinor > 0) ? 'Platform commission is borne by the organizer.' : null,
      },
      stats: { followers: followStats, going: interested, comments },
      mine,
      canManage: Boolean(isOrgMember),
    })
  })
}

/** PATCH /api/v1/events/[id] — organizer editing (org-scoped permission). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const { eventOrgAccess, orgCan } = await import('@/server/permissions')
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('You do not have permission to edit this event.')

    const body = await readJson<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}
    const textFields: [string, number][] = [
      ['title', 140], ['summary', 200], ['description', 8000], ['categorySlug', 40],
      ['city', 60], ['timezone', 60], ['contactEmail', 160], ['contactPhone', 24],
      ['accessibilityInfo', 500], ['attendanceRules', 500], ['ageGuidance', 60],
      ['refundPolicy', 500], ['coverImageUrl', 300], ['directionsUrl', 300],
    ]
    for (const [field, max] of textFields) {
      if (body[field] !== undefined) data[field] = sanitizeText(body[field], max) || null
    }
    if (body.tags !== undefined) data.tags = JSON.stringify(parseTags(body.tags))
    if (body.mode && ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(body.mode))) data.mode = String(body.mode)
    if (body.venueId !== undefined) data.venueId = body.venueId ? String(body.venueId) : null
    if (body.startsAt) {
      const d = new Date(String(body.startsAt))
      if (Number.isNaN(d.getTime())) throw errors.badRequest('Invalid start date.')
      data.startsAt = d
    }
    if (body.endsAt) {
      const d = new Date(String(body.endsAt))
      if (Number.isNaN(d.getTime())) throw errors.badRequest('Invalid end date.')
      data.endsAt = d
    }
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw errors.badRequest('End must be after start.')

    const updated = await db.event.update({ where: { id: access.event.id }, data })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'event.edit', entityType: 'Event', entityId: access.event.id, after: { title: updated.title } })
    void orgCan
    return jsonOk({ event: updated })
  })
}
