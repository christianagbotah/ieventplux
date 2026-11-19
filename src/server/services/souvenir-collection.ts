import { db } from '@/lib/db'
import { errors } from '../api'

export interface CollectSouvenirInput {
  orderId: string
  eventId: string
  orderItemId: string
  collectorId: string
  qty: number
  clientActionId: string
  note?: string | null
}

/**
 * Durable physical souvenir handover. The caller must independently verify
 * accepted event-staff membership BEFORE invoking this service. A signed QR is
 * only a lookup token; staff permission and PAID status are rechecked by the
 * API. Within this transaction, order status and per-line quantity are locked
 * so refunds, retries and simultaneous devices cannot double-collect.
 */
export async function collectSouvenirItem(input: CollectSouvenirInput) {
  if (!Number.isSafeInteger(input.qty) || input.qty < 1 || input.qty > 20) {
    throw errors.badRequest('Collection quantity must be between 1 and 20.')
  }
  if (!/^[a-f0-9-]{36}$/i.test(input.clientActionId)) {
    throw errors.badRequest('A valid unique collection action ID is required.')
  }
  return db.$transaction(async (tx) => {
    // Serialize retries with the SAME idempotency ID. Retries with a different
    // id must pass the atomic uncollected-quantity guard below.
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtext(${input.clientActionId}), hashtext('souvenir-collection'))`
    const old = await tx.souvenirCollection.findUnique({ where: { clientActionId: input.clientActionId } })
    if (old) {
      if (old.orderItemId !== input.orderItemId || old.qty !== input.qty || old.eventId !== input.eventId) {
        throw errors.conflict('Collection request ID was previously used for a different handover.')
      }
      return { id: old.id, status: 'ALREADY_RECORDED' as const, qty: old.qty }
    }
    // Stronger than a normal read: financial status transitions and collection
    // are ordered on the same Order row to prevent late refund/admission races.
    const rows = await tx.$queryRaw<Array<{ status: string; eventId: string }>>`
      SELECT "status", "eventId" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
    const fresh = rows[0]
    if (!fresh || fresh.eventId !== input.eventId || fresh.status !== 'PAID') {
      throw errors.conflict('The receipt is not fully paid or is under refund review.')
    }
    const updated = await tx.$executeRaw`
      UPDATE "SouvenirOrderItem"
      SET "collectedQty" = "collectedQty" + ${input.qty}, "updatedAt" = NOW()
      WHERE "id" = ${input.orderItemId}
        AND "orderId" = ${input.orderId}
        AND "holdStatus" = 'CONSUMED'
        AND "collectedQty" + ${input.qty} <= "qty"
    `
    if (updated !== 1) throw errors.conflict('This souvenir has already been collected, or insufficient quantity remains.')
    const item = await tx.souvenirOrderItem.findUniqueOrThrow({ where: { id: input.orderItemId }, select: { productId: true } })
    await tx.eventSouvenirProduct.update({ where: { id: item.productId }, data: { stockFulfilled: { increment: input.qty } } })
    const record = await tx.souvenirCollection.create({ data: {
      orderItemId: input.orderItemId,
      eventId: input.eventId,
      collectorId: input.collectorId,
      qty: input.qty,
      clientActionId: input.clientActionId,
      note: input.note?.slice(0, 200) ?? null,
    } })
    return { id: record.id, status: 'COLLECTED' as const, qty: input.qty }
  })
}
