import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText, jsonList, pagination, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * Event sub-resources:
 *  GET/POST  transition, agenda, media, comments, updates, invitations, ticket-types, attendees, orders, roster
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const url = new URL(req.url)

    if (action === 'agenda') {
      const items = await db.agendaItem.findMany({ where: { eventId: id }, orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] })
      return jsonOk({ items })
    }

    if (action === 'media') {
      const items = await db.mediaAsset.findMany({ where: { eventId: id, OR: [{ linksToEventId: id }] }, orderBy: { createdAt: 'desc' } })
      return jsonOk({ items })
    }

    if (action === 'comments') {
      const { page, pageSize, offset } = pagination(req, 20, 50)
      const items = await db.comment.findMany({
        where: { eventId: id, status: 'VISIBLE', parentId: null },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          children: { where: { status: 'VISIBLE' }, include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.comment.count({ where: { eventId: id, status: 'VISIBLE', parentId: null } })
      return jsonList(items, total, page, pageSize)
    }

    if (action === 'updates') {
      const items = await db.eventUpdate.findMany({ where: { eventId: id }, orderBy: { createdAt: 'desc' }, take: 30 })
      return jsonOk({ items })
    }

    if (action === 'attendees') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'attendees:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Attendee lists are restricted to the event organization.')
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const tickets = await db.ticket.findMany({
        where: { eventId: id },
        include: { ticketType: { select: { name: true } }, order: { select: { reference: true, status: true, buyerName: true } } },
        orderBy: { issuedAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.ticket.count({ where: { eventId: id } })
      return jsonList(
        tickets.map((t) => ({
          id: t.id, code: t.code, holderName: t.holderName, ticketType: t.ticketType.name, status: t.status,
          checkedInAt: t.checkedInAt, issuedAt: t.issuedAt, orderRef: t.order?.reference ?? null,
        })),
        total, page, pageSize
      )
    }

    if (action === 'orders') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'orders:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Orders are restricted to the event organization.')
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const orders = await db.order.findMany({
        where: { eventId: id },
        include: { items: { include: { ticketType: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.order.count({ where: { eventId: id } })
      return jsonList(orders, total, page, pageSize)
    }

    if (action === 'invitations') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Invitations are managed by the event organization.')
      const items = await db.invitation.findMany({ where: { eventId: id }, orderBy: { createdAt: 'desc' } })
      return jsonOk({ items })
    }

    if (action === 'stats') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'orders:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Event statistics are restricted to the event organization.')
      const [paidOrders, freeOrders, ticketsSold, checkedIn, revenue, byType] = await Promise.all([
        db.order.count({ where: { eventId: id, status: 'PAID', kind: 'PAID' } }),
        db.order.count({ where: { eventId: id, status: 'PAID', kind: 'FREE' } }),
        db.ticket.count({ where: { eventId: id, status: { in: ['VALID', 'CHECKED_IN', 'REFUNDED'] } } }),
        db.ticket.count({ where: { eventId: id, status: 'CHECKED_IN' } }),
        db.order.aggregate({ where: { eventId: id, status: 'PAID' }, _sum: { totalMinor: true, platformFeeMinor: true } }),
        db.ticketType.findMany({ where: { eventId: id }, select: { name: true, quota: true, soldCount: true, reservedCount: true, priceMinor: true } }),
      ])
      return jsonOk({
        paidOrders, freeOrders, ticketsSold, checkedIn,
        grossMinor: revenue._sum.totalMinor ?? 0,
        feesMinor: revenue._sum.platformFeeMinor ?? 0,
        netMinor: (revenue._sum.totalMinor ?? 0) - (revenue._sum.platformFeeMinor ?? 0),
        byType,
      })
    }

    if (action === 'discount-codes') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Ticket management is restricted to the event organization.')
      const items = await db.discountCode.findMany({ where: { eventId: id } })
      return jsonOk({ items })
    }

    void url
    throw errors.notFound(`Unknown event sub-resource '${action}'.`)
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>)

    // ── Lifecycle transitions (publish/cancel/postpone/schedule) ──────────
    if (action === 'transition') {
      const access = await eventOrgAccess(user.id, id, 'event:publish')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to change this event\'s status.')
      const to = String(body.to ?? '')
      if (!['DRAFT', 'SCHEDULED', 'PUBLISHED', 'POSTPONED', 'CANCELLED', 'LIVE', 'ENDED'].includes(to)) throw errors.badRequest('Invalid target status.')
      if (to === 'CANCELLED' || to === 'POSTPONED') {
        const cancelAccess = await eventOrgAccess(user.id, id, 'event:cancel')
        if (!cancelAccess.allowed) throw errors.forbidden('Cancelling or postponing requires an owner or admin role.')
      }
      const { transitionEvent } = await import('@/server/services/events')
      if (to === 'PUBLISHED') {
        // Paid selling requires a verified organization (settlement model rule).
        const org = await db.organization.findUnique({ where: { id: access.event.orgId } })
        const hasPaidTickets = await db.ticketType.count({ where: { eventId: id, priceMinor: { gt: 0 } } })
        if (org && org.status !== 'ACTIVE' && hasPaidTickets > 0) {
          throw errors.forbidden('Paid ticket sales require organizer verification before publishing. Submit verification documents or set tickets to free RSVP.')
        }
        const { assertCanPublishNewEvent } = await import('@/server/services/subscriptions')
        await assertCanPublishNewEvent(access.event.orgId)
      }
      const updated = await transitionEvent({ eventId: id, to, actorId: user.id, reason: body.reason ? String(body.reason) : undefined, publishAt: body.publishAt ? new Date(String(body.publishAt)) : null })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `event.${to.toLowerCase()}`, entityType: 'Event', entityId: id, after: { status: to } })
      return jsonOk({ event: updated })
    }

    // ── Agenda items ──────────────────────────────────────────────────────
    if (action === 'agenda') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.allowed) throw errors.forbidden('You do not have permission to edit this event.')
      const title = sanitizeText(body.title, 160)
      if (!title) throw errors.badRequest('Agenda item title is required.')
      const item = await db.agendaItem.create({
        data: {
          eventId: id,
          title,
          startsAt: new Date(String(body.startsAt ?? new Date().toISOString())),
          endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
          speaker: sanitizeText(body.speaker, 120) || null,
          description: sanitizeText(body.description, 500) || null,
          sortOrder: Number(body.sortOrder ?? 0),
        },
      })
      return jsonOk({ item })
    }

    // ── Organizer updates (posts) ─────────────────────────────────────────
    if (action === 'updates') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to post updates.')
      const title = sanitizeText(body.title, 160)
      const bodyText = sanitizeText(body.body, 2000)
      if (!title || !bodyText) throw errors.badRequest('Title and body are required.')
      const update = await db.eventUpdate.create({ data: { eventId: id, orgId: access.event.orgId, title, body: bodyText } })
      // Notify ticket holders + followers.
      const { notifyUser } = await import('@/server/services/notify')
      const holders = await db.ticket.findMany({ where: { eventId: id, status: 'VALID' }, select: { userId: true }, distinct: ['userId'] })
      for (const h of holders.slice(0, 500)) {
        if (!h.userId) continue
        await notifyUser({ userId: h.userId, type: 'EVENT_CHANGE', title, body: bodyText.slice(0, 200), link: `#/event/${id}` }).catch(() => {})
      }
      return jsonOk({ update })
    }

    // ── Comments (discussion/Q&A) ─────────────────────────────────────────
    if (action === 'comments') {
      rateLimit(req, 'comment', 10, 60_000)
      const event = await db.event.findUnique({ where: { id } })
      if (!event) throw errors.notFound('Event not found.')
      const text = sanitizeText(body.body, 1000)
      if (text.length < 2) throw errors.badRequest('Comment is empty.')
      const comment = await db.comment.create({
        data: { eventId: id, userId: user.id, parentId: body.parentId ? String(body.parentId) : null, body: text },
      })
      return jsonOk({ comment })
    }

    // ── Invitations ───────────────────────────────────────────────────────
    if (action === 'invitations') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage invitations.')
      const { invitationCode } = await import('@/server/ids')
      const invitation = await db.invitation.create({
        data: {
          eventId: id,
          code: String(body.code ?? invitationCode()).toUpperCase().slice(0, 24),
          displayName: sanitizeText(body.displayName, 120) || null,
          contact: sanitizeText(body.contact, 160) || null,
          maxGuests: Math.max(1, Math.min(10, Number(body.maxGuests ?? 2))),
          requireApproval: Boolean(body.requireApproval),
          expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
          createdBy: user.id,
        },
      })
      return jsonOk({ invitation })
    }

    // ── Discount codes ────────────────────────────────────────────────────
    if (action === 'discount-codes') {
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage discounts.')
      const code = sanitizeText(body.code, 24).toUpperCase()
      if (code.length < 3) throw errors.badRequest('Code must be at least 3 characters.')
      const dc = await db.discountCode.create({
        data: {
          eventId: id,
          code,
          pctOff: body.pctOff ? Math.min(90, Math.max(1, Number(body.pctOff))) : null,
          amountOffMinor: body.amountOffMinor ? Math.max(1, Number(body.amountOffMinor)) : null,
          maxUses: Math.max(1, Number(body.maxUses ?? 100)),
          expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
        },
      })
      return jsonOk({ discountCode: dc })
    }

    // ── Ticket types ──────────────────────────────────────────────────────
    if (action === 'ticket-types') {
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage tickets.')
      const name = sanitizeText(body.name, 80)
      if (!name) throw errors.badRequest('Ticket type name is required.')
      const priceMinor = Math.max(0, Math.round(Number(body.priceMinor ?? 0)))
      const quota = Math.max(0, Math.round(Number(body.quota ?? 0)))
      const event = await db.event.findUnique({ where: { id } })
      if (priceMinor > 0 && event) {
        const org = await db.organization.findUnique({ where: { id: event.orgId } })
        if (org && org.status !== 'ACTIVE') throw errors.forbidden('Paid ticket types require organizer verification.')
      }
      const tt = await db.ticketType.create({
        data: {
          eventId: id,
          orgId: access.event.orgId,
          name,
          description: sanitizeText(body.description, 300) || null,
          kind: ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(body.kind)) ? String(body.kind) : 'PHYSICAL',
          priceMinor,
          currency: 'GHS',
          quota,
          perBuyerLimit: Math.max(1, Math.min(20, Number(body.perBuyerLimit ?? 4))),
          saleStartsAt: body.saleStartsAt ? new Date(String(body.saleStartsAt)) : null,
          saleEndsAt: body.saleEndsAt ? new Date(String(body.saleEndsAt)) : null,
          includesVirtualAccess: Boolean(body.includesVirtualAccess),
          groupMinQty: body.groupMinQty ? Number(body.groupMinQty) : null,
          groupPctOff: body.groupPctOff ? Number(body.groupPctOff) : null,
          sortOrder: Number(body.sortOrder ?? 0),
        },
      })
      return jsonOk({ ticketType: tt })
    }

    throw errors.notFound(`Unknown event action '${action}'.`)
  })
}
