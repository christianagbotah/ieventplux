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
    const reviews = await db.eventReview.aggregate({ where: { eventId: event.id, status: 'VISIBLE' }, _avg: { rating: true }, _count: true })
    const ratingAvg = reviews._avg.rating ? Math.round(reviews._avg.rating * 10) / 10 : 0

    // R28: the invitation-only address gate now keys on an APPROVED RSVP, not
    // the social "going" interest (which any signed-in user could toggle — a
    // real privacy hole for private events). Approved guests and org members
    // see the real address; everyone else gets the honest placeholder.
    const myRsvp =
      session && event.visibility === 'INVITE_ONLY'
        ? await db.rsvp.findFirst({ where: { eventId: event.id, userId: session.user.id }, select: { status: true, guests: true } })
        : null
    const inviteApproved = Boolean(myRsvp && myRsvp.status === 'APPROVED')

    const mine = session
      ? {
          saved: Boolean(await db.eventInterest.findFirst({ where: { userId: session.user.id, eventId: event.id, kind: 'SAVE' } })),
          going: Boolean(await db.eventInterest.findFirst({ where: { userId: session.user.id, eventId: event.id, kind: 'GOING' } })),
          following: Boolean(await db.follow.findFirst({ where: { userId: session.user.id, orgId: event.orgId } })),
          rsvpStatus: myRsvp ? myRsvp.status : null,
          rsvpGuests: myRsvp ? myRsvp.guests : null,
        }
      : { saved: false, going: false, following: false, rsvpStatus: null, rsvpGuests: null }

    const venue = event.venue
    const venueSafe = venue
      ? {
          ...venue,
          // Full address stays private for invitation-only events until an invitation is approved.
          address: event.visibility === 'INVITE_ONLY' && !isOrgMember && !inviteApproved ? 'Address shared with approved guests' : venue.address,
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
      stats: { followers: followStats, going: interested, comments, ratingAvg, ratingCount: reviews._count },
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
      if (body[field] === undefined) continue
      // R31 defect fix: title/description/categorySlug are NON-NULLABLE columns —
      // an empty value must coerce to '' (the POST contract), never null. The old
      // `|| null` made any save with a blank description 500 (Prisma validation).
      if (field === 'title' || field === 'description' || field === 'categorySlug') {
        data[field] = sanitizeText(body[field], max) || ''
      } else {
        data[field] = sanitizeText(body[field], max) || null
      }
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
