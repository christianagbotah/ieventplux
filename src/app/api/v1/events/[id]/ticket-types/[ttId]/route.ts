import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { boundedInt, ticketSalesSettings } from '@/server/ticket-sales-policy'

type RouteContext = { params: Promise<{ id: string; ttId: string }> }

/** PATCH /api/v1/events/[id]/ticket-types/[ttId] — edit ticket type (quota edits never undo sold inventory). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, ttId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.allowed) throw errors.forbidden('You do not have permission to manage tickets.')
    const tt = await db.ticketType.findUnique({ where: { id: ttId } })
    if (!tt || tt.eventId !== id) throw errors.notFound('Ticket type not found.')
    const body = await readJson<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = sanitizeText(body.name, 80)
      if (!name) throw errors.badRequest('Ticket type name cannot be empty.')
      data.name = name
    }
    if (body.description !== undefined) data.description = sanitizeText(body.description, 300) || null
    if (body.priceMinor !== undefined) {
      const price = boundedInt(body.priceMinor, 'Ticket price', 0, 100_000_000)
      if (price > 0 && tt.soldCount > 0 && price !== tt.priceMinor) throw errors.conflict('Price cannot change after sales started (immutable price snapshots protect buyers).')
      if (price > 0 && tt.priceMinor === 0) {
        const organizer = await db.organization.findUnique({ where: { id: tt.orgId }, select: { status: true } })
        if (organizer?.status !== 'ACTIVE') throw errors.forbidden('Paid tickets require approved organizer verification.')
      }
      data.priceMinor = price
    }
    if (body.quota !== undefined) {
      const quota = boundedInt(body.quota, 'Ticket quota', 0, 1_000_000)
      if (quota > 0 && quota < tt.soldCount + tt.reservedCount) {
        throw errors.conflict(`Quota cannot go below already sold/reserved (${tt.soldCount + tt.reservedCount}).`)
      }
      data.quota = quota
    }
    const quotaRaised = typeof data.quota === 'number' && (data.quota > tt.quota || (data.quota === 0 && tt.quota > 0))
    if (body.perBuyerLimit !== undefined) data.perBuyerLimit = boundedInt(body.perBuyerLimit, 'Maximum tickets per buyer', 1, 10)
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.includesVirtualAccess !== undefined) data.includesVirtualAccess = Boolean(body.includesVirtualAccess)
    if (['perBuyerLimit', 'saleEndsAt', 'saleStartsAt', 'groupMinQty', 'groupPctOff', 'priceMinor'].some((key) => body[key] !== undefined)) {
      Object.assign(data, ticketSalesSettings(body, {
        perBuyerLimit: tt.perBuyerLimit, saleStartsAt: tt.saleStartsAt, saleEndsAt: tt.saleEndsAt,
        groupMinQty: tt.groupMinQty, groupPctOff: tt.groupPctOff,
      }, typeof data.priceMinor === 'number' ? data.priceMinor : tt.priceMinor))
    }
    const updated = await db.ticketType.update({ where: { id: ttId }, data })

    // A quota raise frees inventory — wake the waitlist so waiting fans get a fair shot.
    if (quotaRaised) {
      const { enqueueWaitlistPromote } = await import('@/server/services/waitlist')
      enqueueWaitlistPromote(id)
    }

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
