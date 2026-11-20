import { db } from '@/lib/db'
import { errors } from '../api'
import { returnIntakeCapacity, type ReturnCondition, type ReturnReviewDecision } from '../souvenir-return-policy'

export interface ReceiveReturnInput {
  orderItemId: string
  eventId: string
  receiverId: string
  qty: number
  clientActionId: string
  condition: ReturnCondition
  reason: string
  evidenceNote: string
}

/** Record the physical item being received, without initiating refunds,
 * stock restoration or admission changes. Authorization happens in API
 * before the service; order-row lock serializes retries and other handovers. */
export async function receiveSouvenirReturn(input: ReceiveReturnInput) {
  if (!Number.isSafeInteger(input.qty) || input.qty < 1 || input.qty > 20) throw errors.badRequest('Enter a return quantity between 1 and 20.')
  if (!/^[a-f0-9-]{36}$/i.test(input.clientActionId)) throw errors.badRequest('Provide a unique return request ID.')
  if (input.reason.trim().length < 10 || input.evidenceNote.trim().length < 12) throw errors.badRequest('Include a reason and factual evidence about the returned goods.')
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${input.clientActionId}), hashtext('souvenir-return'))`
    const prior = await tx.souvenirReturnIntake.findUnique({ where: { clientActionId: input.clientActionId } })
    if (prior) {
      if (prior.orderItemId !== input.orderItemId || prior.qty !== input.qty || prior.receivedById !== input.receiverId || prior.condition !== input.condition || prior.reason !== input.reason || prior.evidenceNote !== input.evidenceNote) {
        throw errors.conflict('Return action ID already belongs to a different physical intake.')
      }
      return { id: prior.id, status: 'ALREADY_RECORDED' as const, qty: prior.qty }
    }
    const orderItem = await tx.souvenirOrderItem.findUnique({ where: { id: input.orderItemId }, select: { orderId: true } })
    if (!orderItem) throw errors.notFound('The souvenir line could not be found.')
    const order = await tx.$queryRaw<Array<{ id: string; eventId: string; status: string }>>`
      SELECT "id", "eventId", "status" FROM "Order" WHERE "id" = ${orderItem.orderId} FOR UPDATE
    `
    const row = order[0]
    if (!row || row.eventId !== input.eventId || !['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'EXCEPTION_REVIEW'].includes(row.status)) {
      throw errors.conflict('The receipt is not eligible for physical return intake.')
    }
    const line = await tx.souvenirOrderItem.findUniqueOrThrow({ where: { id: input.orderItemId }, select: { collectedQty: true, holdStatus: true } })
    if (line.holdStatus !== 'CONSUMED' || line.collectedQty <= 0) throw errors.conflict('No item has been collected on this receipt.')
    const previous = await tx.souvenirReturnIntake.aggregate({
      where: { orderItemId: input.orderItemId, status: { in: ['RECEIVED', 'ACCEPTED'] } }, _sum: { qty: true },
    })
    if (returnIntakeCapacity(line.collectedQty, previous._sum.qty ?? 0) < input.qty) {
      throw errors.conflict('Return exceeds unreturned physically collected quantity.')
    }
    const created = await tx.souvenirReturnIntake.create({ data: {
      orderItemId: input.orderItemId, receivedById: input.receiverId, qty: input.qty,
      clientActionId: input.clientActionId, condition: input.condition,
      reason: input.reason.slice(0, 500), evidenceNote: input.evidenceNote.slice(0, 1000),
    } })
    return { id: created.id, status: 'RECEIVED' as const, qty: created.qty }
  })
}

/** Review custody evidence with a second person. Decision alone does not
 * approve provider refunds, restock returned goods or alter the paid receipt. */
export async function reviewSouvenirReturn(id: string, reviewerId: string, decision: ReturnReviewDecision, note: string) {
  if (note.trim().length < 10) throw errors.badRequest('Record a factual reason for the finance decision.')
  return db.$transaction(async (tx) => {
    const row = await tx.souvenirReturnIntake.findUnique({ where: { id }, select: { id: true, status: true, receivedById: true } })
    if (!row) throw errors.notFound('Return intake not found.')
    if (row.receivedById === reviewerId) throw errors.forbidden('Return intake must be reviewed by a different staff member.')
    if (row.status !== 'RECEIVED') throw errors.conflict('This physical return has already been reviewed.')
    const updated = await tx.souvenirReturnIntake.updateMany({
      where: { id, status: 'RECEIVED' },
      data: { status: decision, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note.trim().slice(0, 500) },
    })
    if (updated.count !== 1) throw errors.conflict('Another finance user already reviewed this intake.')
    return { id, status: decision, note: 'Physical return evidence reviewed. No refund, stock or ticket change has been made.' }
  })
}
