import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { boundedInt, ticketSalesSettings } from '@/server/ticket-sales-policy'
import { ticketQuotaRaised } from '@/server/checkout-policy'

type RouteContext = { params: Promise<{ id: string; ttId: string }> }

/** PATCH /api/v1/events/[id]/ticket-types/[ttId] — edit ticket type (quota edits never undo sold inventory). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, ttId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.allowed) throw errors.forbidden('You do not have permission to manage tickets.')
    const body = await readJson<Record<string, unknown>>(req)
    // Serialize quota and price updates with concurrent checkout reservations.
    const result = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "TicketType" WHERE "id" = ${ttId} AND "eventId" = ${id} FOR UPDATE
      `
      if (locked.length !== 1) throw errors.notFound('Ticket type not found.')
      const tt = await tx.ticketType.findUnique({ where: { id: ttId } })
      if (!tt || tt.eventId !== id) throw errors.notFound('Ticket type not found.')
      const data: Record<string, unknown> = {}
      if (body.name !== undefined) {
        const name = sanitizeText(body.name, 80)
        if (!name) throw errors.badRequest('Ticket type name cannot be empty.')
        data.name = name
      }
      if (body.description !== undefined) data.description = sanitizeText(body.description, 300) || null
      if (body.priceMinor !== undefined) {
        const price = boundedInt(body.priceMinor, 'Ticket price', 0, 100_000_000)
        if (price !== tt.priceMinor) {
          // Existing order snapshots must remain immutable even when no ticket
          // has yet been issued or a reservation has expired.
          const history = await tx.orderItem.findFirst({ where: { ticketTypeId: tt.id }, select: { id: true } })
          if (history || tt.soldCount > 0 || tt.reservedCount > 0) {
            throw errors.conflict('Ticket price cannot change after the first reservation or order. Create a new ticket tier instead.')
          }
          if (price > 0) {
            const organizer = await tx.organization.findUnique({ where: { id: tt.orgId }, select: { status: true } })
            if (organizer?.status !== 'ACTIVE') throw errors.forbidden('Paid tickets require approved organizer verification.')
          }
        }
        data.priceMinor = price
      }
      if (body.perBuyerLimit !== undefined) data.perBuyerLimit = boundedInt(body.perBuyerLimit, 'Maximum tickets per buyer', 1, 10)
      if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') throw errors.badRequest('Ticket active status must be true or false.')
        data.active = body.active
      }
      if (body.includesVirtualAccess !== undefined) {
        if (typeof body.includesVirtualAccess !== 'boolean') throw errors.badRequest('Online access status must be true or false.')
        data.includesVirtualAccess = body.includesVirtualAccess
      }
      if (['perBuyerLimit', 'saleEndsAt', 'saleStartsAt', 'groupMinQty', 'groupPctOff', 'priceMinor'].some((key) => body[key] !== undefined)) {
        Object.assign(data, ticketSalesSettings(body, {
          perBuyerLimit: tt.perBuyerLimit, saleStartsAt: tt.saleStartsAt, saleEndsAt: tt.saleEndsAt,
          groupMinQty: tt.groupMinQty, groupPctOff: tt.groupPctOff,
        }, typeof data.priceMinor === 'number' ? data.priceMinor : tt.priceMinor))
      }
      let capacityIncreased = false
      if (body.quota !== undefined) {
        const requestedQuota = boundedInt(body.quota, 'Ticket quota', 0, 1_000_000)
        // This SELECT FOR UPDATE is held until commit: checkouts cannot reserve
        // another seat between validating inventory and reducing the quota.
        if (requestedQuota > 0 && requestedQuota < tt.soldCount + tt.reservedCount) {
          throw errors.conflict(`Quota cannot go below already sold/reserved (${tt.soldCount + tt.reservedCount}).`)
        }
        capacityIncreased = ticketQuotaRaised(tt.quota, requestedQuota)
        data.quota = requestedQuota
      }
      const updated = Object.keys(data).length > 0
        ? await tx.ticketType.update({ where: { id: ttId }, data })
        : tt
      return { updated, capacityIncreased }
    })
    // A genuine capacity increase wakes the waitlist; unlimited -> finite
    // must not send a misleading 'more seats available' notification.
    if (result.capacityIncreased) {
      const { enqueueWaitlistPromote } = await import('@/server/services/waitlist')
      enqueueWaitlistPromote(id)
    }
    const updated = result.updated
    return jsonOk({ ticketType: updated })
  })
}

/** DELETE — soft-deactivate (financial history is never destroyed). */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { id, ttId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.allowed) throw errors.forbidden('You do not have permission to manage tickets.')
    const tt = await db.ticketType.findUnique({ where: { id: ttId } })
    if (!tt || tt.eventId !== id) throw errors.notFound('Ticket type not found.')
    if (tt.soldCount > 0) {
      await db.ticketType.update({ where: { id: ttId }, data: { active: false } })
      return jsonOk({ deactivated: true, note: 'Ticket type deactivated (sales history preserved).' })
    }
    await db.ticketType.update({ where: { id: ttId }, data: { active: false } })
    return jsonOk({ deactivated: true })
  })
}
