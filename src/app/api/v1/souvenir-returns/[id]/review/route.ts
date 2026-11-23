import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, readJson, rateLimit, errors } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { souvenirCollectionEnabled } from '@/server/souvenir-policy'
import { validateReturnDecision } from '@/server/souvenir-return-policy'

type Context = { params: Promise<{ id: string }> }

/** Finance verifies custody evidence independently of receiving staff.
 * ACCEPTED means verified physically received — NOT refunded or restocked. */
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const user = await requireUser()
    if (!souvenirCollectionEnabled()) throw errors.unavailable('SOUVENIR_RETURNS_DISABLED', 'Physical return review is not enabled.')
    await rateLimit(req, 'souvenir-return-review', 35, 60_000)
    const { id } = await ctx.params
    const record = await db.souvenirReturnIntake.findUnique({ where: { id }, select: { orderItem: { select: { order: { select: { eventId: true } } } } } })
    if (!record) throw errors.notFound('Return intake not found.')
    const access = await eventOrgAccess(user.id, record.orderItem.order.eventId, 'refund:request')
    if (!access.allowed) throw errors.forbidden('Only accepted organizer finance staff may review returned merchandise.')
    const body = await readJson<Record<string, unknown>>(req)
    const decision = validateReturnDecision(body.decision)
    if (!decision) throw errors.badRequest('Only accept or reject physical receipt evidence; refunds and restocking are separate.')
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
    if (note.length < 10) throw errors.badRequest('Provide a factual review note of at least 10 characters.')
    const { reviewSouvenirReturn } = await import('@/server/services/souvenir-returns')
    const result = await reviewSouvenirReturn(id, user.id, decision, note)
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'souvenir.return_review', entityType: 'SouvenirReturnIntake', entityId: id, after: { decision, note } })
    return jsonOk(result, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
