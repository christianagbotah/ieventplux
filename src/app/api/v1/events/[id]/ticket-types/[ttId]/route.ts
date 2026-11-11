import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'

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
    if (body.name !== undefined) data.name = sanitizeText(body.name, 80)
    if (body.description !== undefined) data.description = sanitizeText(body.description, 300) || null
    if (body.priceMinor !== undefined) {
      const price = Math.max(0, Math.round(Number(body.priceMinor)))
      if (price > 0 && tt.soldCount > 0) throw errors.conflict('Price cannot change after sales started (immutable price snapshots protect buyers).')
      data.priceMinor = price
    }
    if (body.quota !== undefined) {
      const quota = Math.max(0, Math.round(Number(body.quota)))
      if (quota > 0 && quota < tt.soldCount + tt.reservedCount) {
        throw errors.conflict(`Quota cannot go below already sold/reserved (${tt.soldCount + tt.reservedCount}).`)
      }
      data.quota = quota
    }
    if (body.perBuyerLimit !== undefined) data.perBuyerLimit = Math.max(1, Math.min(20, Number(body.perBuyerLimit)))
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.includesVirtualAccess !== undefined) data.includesVirtualAccess = Boolean(body.includesVirtualAccess)
    if (body.saleEndsAt !== undefined) data.saleEndsAt = body.saleEndsAt ? new Date(String(body.saleEndsAt)) : null
    if (body.saleStartsAt !== undefined) data.saleStartsAt = body.saleStartsAt ? new Date(String(body.saleStartsAt)) : null
    const updated = await db.ticketType.update({ where: { id: ttId }, data })
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
