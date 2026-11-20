import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, readJson, rateLimit, errors } from '@/server/api'
import { eventOrgAccess, orgCan } from '@/server/permissions'
import { souvenirCollectionEnabled } from '@/server/souvenir-policy'
import { validateReturnCondition } from '@/server/souvenir-return-policy'

/** Physical goods return desk, separate from money reversal and stock. The
 * only authority to view and receive is accepted membership in the event org. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    if (!souvenirCollectionEnabled()) throw errors.unavailable('SOUVENIR_RETURNS_DISABLED', 'Physical return intake is not enabled.')
    await rateLimit(req, 'souvenir-return-intake', 40, 60_000)
    const body = await readJson<Record<string, unknown>>(req)
    const orderItemId = typeof body.orderItemId === 'string' ? body.orderItemId : ''
    const item = await db.souvenirOrderItem.findUnique({ where: { id: orderItemId }, select: { order: { select: { eventId: true } } } })
    if (!item) throw errors.notFound('Souvenir item not found.')
    const access = await eventOrgAccess(user.id, item.order.eventId, 'checkin:scan')
    if (!access.allowed) throw errors.forbidden('Only accepted event collection staff can record a physical return.')
    const condition = validateReturnCondition(body.condition)
    if (!condition) throw errors.badRequest('Select the observed condition: sealed, opened or damaged.')
    const qty = body.qty
    if (!Number.isSafeInteger(qty) || (qty as number) < 1 || (qty as number) > 20) throw errors.badRequest('Return quantity must be 1–20.')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    const evidenceNote = typeof body.evidenceNote === 'string' ? body.evidenceNote.trim().slice(0, 1000) : ''
    if (reason.length < 10 || evidenceNote.length < 12) throw errors.badRequest('Provide a clear return reason and an inspection/evidence note.')
    const actionId = typeof body.clientActionId === 'string' ? body.clientActionId : ''
    const { receiveSouvenirReturn } = await import('@/server/services/souvenir-returns')
    const result = await receiveSouvenirReturn({
      orderItemId, eventId: item.order.eventId, receiverId: user.id, qty: qty as number,
      condition, reason, evidenceNote, clientActionId: actionId,
    })
    if (result.status === 'RECEIVED') {
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'souvenir.return_receive', entityType: 'SouvenirReturnIntake', entityId: result.id, after: { orderItemId, qty, condition } })
    }
    return jsonOk({ ...result, note: 'Physical item received pending independent finance review; no refund, restock or ticket changes were made.' }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    if (!souvenirCollectionEnabled()) throw errors.unavailable('SOUVENIR_RETURNS_DISABLED', 'Physical return intake is not enabled.')
    const eventId = req.nextUrl.searchParams.get('eventId') ?? ''
    if (!eventId) throw errors.badRequest('Choose an event to review its physical returns.')
    const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
    if (!access.membership || !(access.allowed || orgCan(access.membership.role, 'refund:request'))) {
      throw errors.forbidden('Only accepted event staff and authorized finance members can view physical return records.')
    }
    const rows = await db.souvenirReturnIntake.findMany({
      where: { orderItem: { order: { eventId } } }, take: 50, orderBy: { createdAt: 'desc' },
      select: { id: true, orderItemId: true, qty: true, condition: true, reason: true,
        evidenceNote: true, status: true, createdAt: true, reviewedAt: true, reviewNote: true,
        receivedBy: { select: { displayName: true } }, reviewedBy: { select: { displayName: true } },
        orderItem: { select: { order: { select: { reference: true, buyerName: true } }, product: { select: { name: true, sku: true, variantLabel: true } } } },
      },
    })
    return jsonOk({ items: rows, note: 'Return records are custody evidence only; no refund, resale, or ticket movement is implied.' }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
