import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { errors } from '../api'
import { transitionMerchandise } from '../merchandise-entitlement-policy'

/** Payment callbacks are authoritative; late ones must never create physical
 * stock that was already sold after the original reservation expired.
 */
class InventoryUnavailable extends Error {}

export async function ensureSouvenirHolds(orderId: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const items = await tx.merchandiseOrderLine.findMany({ where: { orderId }, orderBy: { productId: 'asc' } })
      for (const item of items) {
        if (item.status === 'PAID' || item.status === 'HELD') continue
        if (item.status !== 'EXPIRED') throw new InventoryUnavailable()
        const claimed = await tx.$executeRaw`
          UPDATE "EventSouvenirProduct"
          SET "stockReserved" = "stockReserved" + ${item.qty}
          WHERE "id" = ${item.productId}
            AND "stockSold" + "stockReserved" + ${item.qty} <= "stockTotal"
        `
        if (claimed !== 1) throw new InventoryUnavailable()
        await tx.merchandiseOrderLine.update({ where: { id: item.id }, data: { status: 'HELD' } })
      }
      return true
    })
  } catch (reason) {
    if (reason instanceof InventoryUnavailable) return false
    throw reason
  }
}

/** Called inside the SAME transaction as Order PAID + tickets + ledger. */
export async function consumeSouvenirHolds(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.merchandiseOrderLine.findMany({ where: { orderId }, include: { entitlement: true }, orderBy: { productId: 'asc' } })
  for (const item of items) {
    if (item.status === 'PAID') continue
    if (item.status !== 'HELD' || !item.entitlement) throw errors.conflict('Souvenir stock needs manual reconciliation before payment fulfilment.')
    const updated = await tx.$executeRaw`
      UPDATE "EventSouvenirProduct"
      SET "stockReserved" = "stockReserved" - ${item.qty},
          "stockSold" = "stockSold" + ${item.qty}
      WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
    `
    if (updated !== 1) throw errors.conflict('Physical stock changed during payment confirmation.')
    const now = new Date()
    await tx.merchandiseOrderLine.update({ where: { id: item.id }, data: { status: 'PAID', paidAt: now } })
    const state = transitionMerchandise({
      status: item.entitlement.status as 'UNPAID', qtyPurchased: item.entitlement.qtyPurchased,
      qtyCollected: item.entitlement.qtyCollected, qtyRefunded: item.entitlement.qtyRefunded,
    }, 'PAYMENT_VERIFIED')
    await tx.merchandiseCollectionEntitlement.update({ where: { id: item.entitlement.id }, data: { status: state.status, readyAt: now } })
  }
}

/** The sweep includes souvenir-only orders, which have no ticket reservations. */
export async function releaseExpiredSouvenirHolds(now = new Date()) {
  const candidates = await db.merchandiseOrderLine.findMany({
    where: { status: 'HELD', order: { expiresAt: { lt: now }, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'EXPIRED'] } } },
    select: { orderId: true }, distinct: ['orderId'], take: 300,
  })
  let released = 0
  let ordersExpired = 0
  for (const { orderId } of candidates) {
    const update = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: { select: { status: true } }, merchandiseLines: true } })
      if (!order || !order.expiresAt || order.expiresAt >= now || !['DRAFT', 'PENDING_PAYMENT', 'EXPIRED'].includes(order.status)) return { lines: 0, expired: false }
      if (order.payments.some((payment) => payment.status === 'SUCCESS')) return { lines: 0, expired: false }
      const items = order.merchandiseLines.filter((item) => item.status === 'HELD').sort((a, b) => a.productId.localeCompare(b.productId))
      for (const item of items) {
        const adjusted = await tx.$executeRaw`
          UPDATE "EventSouvenirProduct" SET "stockReserved" = "stockReserved" - ${item.qty}
          WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
        `
        if (adjusted !== 1) throw errors.conflict('Souvenir stock hold reconciliation failed.')
        await tx.merchandiseOrderLine.update({ where: { id: item.id }, data: { status: 'EXPIRED' } })
      }
      const expired = order.status !== 'EXPIRED' && items.length > 0
      if (expired) await tx.order.update({ where: { id: orderId }, data: { status: 'EXPIRED' } })
      return { lines: items.length, expired }
    })
    released += update.lines
    if (update.expired) ordersExpired++
  }
  return { released, ordersExpired }
}

/** Refuse to strand physical holds when tickets cannot be issued after payment. */
export async function releaseSouvenirHoldsForReview(orderId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!order || order.status === 'PAID') return 0
    const items = await tx.merchandiseOrderLine.findMany({ where: { orderId, status: 'HELD' },
      include: { entitlement: true }, orderBy: { productId: 'asc' },
    })
    for (const item of items) {
      const adjusted = await tx.$executeRaw`
        UPDATE "EventSouvenirProduct" SET "stockReserved" = "stockReserved" - ${item.qty}
        WHERE "id" = ${item.productId} AND "stockReserved" >= ${item.qty}
      `
      if (adjusted !== 1) throw errors.conflict('Physical stock needs reconciliation.')
      await tx.merchandiseOrderLine.update({ where: { id: item.id }, data: { status: 'EXCEPTION_REVIEW' } })
      if (item.entitlement && item.entitlement.status === 'UNPAID') {
        await tx.merchandiseCollectionEntitlement.update({ where: { id: item.entitlement.id }, data: { status: 'EXCEPTION_REVIEW' } })
      }
    }
    return items.length
  })
}
