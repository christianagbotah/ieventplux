import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errors, handle, jsonOk, rateLimit, readJson, requireUser } from '@/server/api'
import { networkAccess } from '@/server/event-network-access'
import {
  NETWORK_INTEREST_KIND, NETWORK_PAGE_SIZE, NETWORK_VISIBLE_PRIVACY, validNetworkAction, publicNetworkProfile,
} from '@/server/event-network-policy'

type Ctx = { params: Promise<{ id: string }> }
const privateResponse = (payload: object) => jsonOk(payload, {
  headers: { 'Cache-Control': 'private, no-store' },
})

/**
 * No attendee names or profile IDs are returned until the requester has
 * a real ticket/approved free RSVP or accepted organizer role AND explicitly
 * opts into the event network. Public event discovery is unaffected.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await rateLimit(req, 'event-network-read', 40, 60_000)
    const { id } = await ctx.params
    const access = await networkAccess(id)
    if (!access.eligible || !access.optedIn) {
      return privateResponse({ eligible: access.eligible, optedIn: access.optedIn, items: [], hasMore: false, nextCursor: null })
    }

    const cursor = new URL(req.url).searchParams.get('cursor')
    if (cursor) {
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(cursor)) throw errors.badRequest('Invalid network cursor.')
      const source = await db.eventInterest.findUnique({ where: { id: cursor }, select: { eventId: true, kind: true } })
      if (!source || source.eventId !== id || source.kind !== NETWORK_INTEREST_KIND) {
        throw errors.badRequest('Invalid network cursor.')
      }
    }
    const event = await db.event.findUnique({
      where: { id },
      select: { orgId: true, org: { select: { ownerId: true } }, ticketTypes: {
        where: { active: true, priceMinor: { gt: 0 } }, select: { id: true }, take: 1,
      } },
    })
    if (!event) throw errors.notFound('Event network unavailable.')

    // Bidirectional blocks prevent the two profiles from appearing to each
    // other even when both previously opted in.
    const blocks = await db.userBlock.findMany({
      where: { OR: [{ blockerId: access.userId }, { blockedId: access.userId }] },
      select: { blockerId: true, blockedId: true },
    })
    const excluded = blocks.map((block) => block.blockerId === access.userId ? block.blockedId : block.blockerId)
    const rows = await db.eventInterest.findMany({
      where: {
        eventId: id, kind: NETWORK_INTEREST_KIND, privacy: NETWORK_VISIBLE_PRIVACY,
        userId: { notIn: excluded },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true, userId: true, createdAt: true,
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: NETWORK_PAGE_SIZE + 1,
    })
    const page = rows.slice(0, NETWORK_PAGE_SIZE)
    const ids = page.map((row) => row.userId)
    const [tickets, approvals, staff, follows] = await Promise.all([
      db.ticket.findMany({ where: { eventId: id, userId: { in: ids }, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { userId: true } }),
      db.rsvp.findMany({ where: { eventId: id, userId: { in: ids }, status: 'APPROVED' }, select: { userId: true } }),
      db.membership.findMany({ where: { orgId: event.orgId, userId: { in: ids }, acceptedAt: { not: null } }, select: { userId: true } }),
      db.follow.findMany({ where: { followerId: access.userId, userId: { in: ids } }, select: { userId: true } }),
    ])
    const ticketHolders = new Set(tickets.map((r) => r.userId))
    const approved = new Set(approvals.map((r) => r.userId))
    const organizers = new Set(staff.map((r) => r.userId))
    const following = new Set(follows.map((r) => r.userId))
    const paidTicketRequired = event.ticketTypes.length > 0

    // Recheck every visible member's entitlement at READ time: a refunded or
    // revoked attendee must disappear immediately without a background job.
    const items = page.filter((row) =>
      row.userId === event.org.ownerId || organizers.has(row.userId) ||
      ticketHolders.has(row.userId) || (!paidTicketRequired && approved.has(row.userId))
    ).map((row) => publicNetworkProfile(row.user, {
      following: following.has(row.userId), isMe: row.userId === access.userId,
    }))
    return privateResponse({
      eligible: true, optedIn: true, items,
      hasMore: rows.length > NETWORK_PAGE_SIZE,
      nextCursor: rows.length > NETWORK_PAGE_SIZE ? page[page.length - 1]?.id ?? null : null,
    })
  })
}

/** Joining is NEVER inferred from RSVP, ticket purchase or visiting an event. */
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await rateLimit(req, 'event-network-consent', 10, 60_000)
    const user = await requireUser()
    const { id } = await ctx.params
    const body = await readJson<{ action?: unknown }>(req)
    if (!validNetworkAction(body.action)) throw errors.badRequest('Choose join or leave.')
    if (body.action === 'leave') {
      // Consent revocation remains possible after cancellation, ticket refund
      // or loss of organizer membership; no admission check may block leaving.
      await db.eventInterest.deleteMany({ where: { userId: user.id, eventId: id, kind: NETWORK_INTEREST_KIND } })
      return privateResponse({ optedIn: false })
    }
    const access = await networkAccess(id)
    if (access.userId !== user.id) throw errors.forbidden()
    if (!access.eligible) throw errors.forbidden('A valid ticket, approved free RSVP or organizer role is required.')
    await db.eventInterest.upsert({
      where: { userId_eventId_kind: { userId: user.id, eventId: id, kind: NETWORK_INTEREST_KIND } },
      create: { userId: user.id, eventId: id, kind: NETWORK_INTEREST_KIND, privacy: NETWORK_VISIBLE_PRIVACY },
      update: { privacy: NETWORK_VISIBLE_PRIVACY },
    })
    return privateResponse({ optedIn: true })
  })
}
