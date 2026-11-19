import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { errors } from '../api'

/** A verified payment is authoritative, but late payment cannot mint physical
 * merchandise that has already been resold after the reservation expired.
 * Locking Order before stock rows serializes fulfilment with expiry sweeps.
 */
class NoMerchStock extends Error {}

export async function ensureSouvenirHolds(orderId: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const items = await tx.souvenirOrderItem.findMany({ where: { orderId }, orderBy: { productId: 'asc' } })
      for (const item of items) {
        if (item.holdStatus === 'CONSUMED' || item.holdStatus === 'ACTIVE') continue
        if (item.holdStatus !== 'RELEASED') throw new NoMerchStock()
        const claimed = await tx.$executeRaw`
          UPDATE "EventSouvenirProduct"
          SET "stockReserved" = "stockReserved" + ${item.qty}
          WHERE "id" = ${item.productId}
            AND "stockSold" + "stockReserved" + ${item.qty} <= "stockTotal"
        `
        if (claimed !== 1) throw new NoMerchStock()
        await tx.souvenirOrderItem.update({ where: { id: item.id }, data: { holdStatus: 'ACTIVE' } })
      }
      return true
    })
  } catch (reason) {
    if (reason instanceof NoMerchStock) return false
    throw reason
  }
}

/** Runs inside the same transaction that marks Order PAID and issues tickets. */
export async function consumeSouvenirHolds(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.souvenirOrderItem.findMany({ where: { orderId }, orderBy: { productId: 'asc' } })
  for (const item of items) {
    if (item.holdStatus === 'CONSUMED') continue
    if (item.holdStatus !== 'ACTIVE') throw errors.conflict('Paid souvenir stock must be revalidated before fulfilment.')
    const updated = await tx.$executeRaw`
      UPDATE "EventSouvenirProduct"
      SET "stockReserved" = "stockReserved" - ${item.qty},
          "stockSold" = "stockSold" + ${item.qty}
      WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
    `
    if (updated !== 1) throw errors.conflict('Souvenir inventory changed during payment confirmation.')
    await tx.souvenirOrderItem.update({ where: { id: item.id }, data: { holdStatus: 'CONSUMED' } })
  }
}

/** Reclaim stale physical stock holds, including merchandise-only orders.
 * A successful payment event wins over expiry, even before worker fulfilment.
 * Returns number of order lines released and newly expired orders.
 */
export async function releaseExpiredSouvenirHolds(now = new Date()) {
  const candidates = await db.souvenirOrderItem.findMany({
    where: {
      holdStatus: 'ACTIVE', order: { expiresAt: { lt: now }, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'EXPIRED'] } },
    }, select: { orderId: true }, distinct: ['orderId'], take: 300,
  })
  let released = 0
  let ordersExpired = 0
  for (const { orderId } of candidates) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: { select: { status: true } }, souvenirItems: true } })
      if (!order || !order.expiresAt || order.expiresAt >= now || !['DRAFT', 'PENDING_PAYMENT', 'EXPIRED'].includes(order.status)) return
      if (order.payments.some((payment) => payment.status === 'SUCCESS')) return
      const items = order.souvenirItems.filter((item) => item.holdStatus === 'ACTIVE').sort((a, b) => a.productId.localeCompare(b.productId))
      for (const item of items) {
        const adjusted = await tx.$executeRaw`
          UPDATE "EventSouvenirProduct" SET "stockReserved" = "stockReserved" - ${item.qty}
          WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
        `
        if (adjusted !== 1) throw errors.conflict('Souvenir stock hold reconciliation failed; manual review required.')
        await tx.souvenirOrderItem.update({ where: { id: item.id }, data: { holdStatus: 'RELEASED' } })
        released++
      }
      if (order.status !== 'EXPIRED' && items.length > 0) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'EXPIRED' } })
        ordersExpired++
      }
    })
  }
  return { released, ordersExpired }
}

/** A charged order routed to refund review must not indefinitely block the
 * merchandise inventory while ticket capacity is unavailable. Safe to retry.
 */
export async function releaseSouvenirHoldsForReview(orderId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!order || order.status === 'PAID') return 0
    const items = await tx.souvenirOrderItem.findMany({ where: { orderId, holdStatus: 'ACTIVE' }, orderBy: { productId: 'asc' } })
    for (const item of items) {
      const adjusted = await tx.$executeRaw`
        UPDATE "EventSouvenirProduct" SET "stockReserved" = "stockReserved" - ${item.qty}
        WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
      `
      if (adjusted !== 1) throw errors.conflict('Physical inventory requires staff reconciliation.')
      await tx.souvenirOrderItem.update({ where: { id: item.id }, data: { holdStatus: 'RELEASED' } })
    }
    return items.length
  })
}
