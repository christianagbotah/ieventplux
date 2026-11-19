import { db } from '@/lib/db'
import { errors } from '../api'
import { eventOrgAccess } from '../permissions'
import { verifySouvenirCollectionToken, merchandiseCollectionEnabled } from '../souvenir-policy'
import { transitionMerchandise, type MerchandiseStatus } from '../merchandise-entitlement-policy'

/** Receipt QR is lookup-only, NOT a bearer authorization or admission ticket.
 * Every read/collection checks a currently accepted event-staff membership.
 */
async function authorizedOrder(token: string, staffUserId: string) {
  const reference = verifySouvenirCollectionToken(token)
  if (!reference) throw errors.notFound('This collection QR is invalid.')
  const order = await db.order.findUnique({ where: { reference }, select: { id: true, eventId: true,
    reference: true, status: true, buyerName: true, paidAt: true,
    event: { select: { id: true, title: true, status: true } },
  } })
  if (!order) throw errors.notFound('Collection receipt not found.')
  const access = await eventOrgAccess(staffUserId, order.eventId, 'checkin:scan')
  if (!access.allowed) throw errors.forbidden('Only accepted event staff may inspect collection receipts.')
  return order
}

export async function getSouvenirCollection(token: string, staffUserId: string) {
  const order = await authorizedOrder(token, staffUserId)
  const lines = await db.merchandiseOrderLine.findMany({ where: { orderId: order.id },
    select: { id: true, qty: true, unitPriceMinor: true, status: true,
      skuSnapshot: true, nameSnapshot: true, variantSnapshot: true,
      product: { select: { imageUrl: true } },
      entitlement: { select: { status: true, qtyPurchased: true, qtyCollected: true, qtyRefunded: true } },
    }, orderBy: { createdAt: 'asc' },
  })
  const ticketCount = await db.ticket.count({ where: { orderId: order.id } })
  const admittedCount = await db.ticket.count({ where: { orderId: order.id, status: 'CHECKED_IN' } })
  const rows = lines.map((line) => {
    const remaining = line.entitlement ? Math.max(0, line.entitlement.qtyPurchased - line.entitlement.qtyCollected - line.entitlement.qtyRefunded) : 0
    return { id: line.id, qty: line.qty, unitPriceMinor: line.unitPriceMinor,
      collectedQty: line.entitlement?.qtyCollected ?? 0, refundedQty: line.entitlement?.qtyRefunded ?? 0,
      remaining, holdStatus: line.status === 'PAID' ? 'CONSUMED' : line.status,
      entitlementStatus: line.entitlement?.status ?? 'UNPAID',
      product: { name: line.nameSnapshot, sku: line.skuSnapshot,
        variantLabel: line.variantSnapshot, imageUrl: line.product.imageUrl },
    }
  })
  const canCollect = merchandiseCollectionEnabled() && order.status === 'PAID' && order.event.status !== 'CANCELLED' && rows.some((row) =>
    row.holdStatus === 'CONSUMED' && ['READY', 'PARTIALLY_COLLECTED'].includes(row.entitlementStatus) && row.remaining > 0)
  return {
    order: { reference: order.reference, buyerName: order.buyerName, status: order.status,
      paidAt: order.paidAt, event: order.event, tickets: ticketCount, admitted: admittedCount },
    lines: rows, canCollect,
    warning: order.status !== 'PAID' ? 'Payment not confirmed. Do not release merchandise or grant admission.'
      : order.event.status === 'CANCELLED' ? 'Event cancelled. Collection requires manual review.'
      : !merchandiseCollectionEnabled() ? 'Staff collection is paused pending operational approval.' : null,
    note: 'Receipt lookup does not admit anyone. Ticket entry requires an independent ticket QR check-in.',
  }
}

export async function collectSouvenirItems(input: { token: string; userId: string; orderItemId: string; qty: number; clientActionId: string }) {
  if (!merchandiseCollectionEnabled()) throw errors.unavailable('MERCH_COLLECTION_DISABLED', 'Collection requires completed event-day QA approval.')
  const order = await authorizedOrder(input.token, input.userId)
  if (!Number.isSafeInteger(input.qty) || input.qty < 1 || input.qty > 20) throw errors.badRequest('Collection quantity must be between 1 and 20.')
  if (!/^[a-z0-9-]{12,70}$/i.test(input.clientActionId)) throw errors.badRequest('A unique collection action ID is required.')
  if (order.status !== 'PAID' || order.event.status === 'CANCELLED') throw errors.conflict('This receipt is not eligible for collection.')
  if (!/^[a-z0-9]{12,45}$/i.test(input.orderItemId)) throw errors.badRequest('Choose a valid merchandise line.')

  return db.$transaction(async (tx) => {
    const line = await tx.merchandiseOrderLine.findFirst({ where: { id: input.orderItemId, orderId: order.id },
      select: { id: true, productId: true, status: true,
        entitlement: { select: { id: true } },
      } })
    if (!line?.entitlement) throw errors.notFound('Merchandise line or entitlement not found.')
    await tx.$queryRaw`SELECT "id" FROM "MerchandiseCollectionEntitlement" WHERE "id" = ${line.entitlement.id} FOR UPDATE`
    const previous = await tx.merchandiseCollectionAction.findUnique({ where: {
      entitlementId_idempotencyKey: { entitlementId: line.entitlement.id, idempotencyKey: input.clientActionId },
    } })
    if (previous) {
      if (previous.action !== 'COLLECT' || previous.actorUserId !== input.userId || previous.qty !== input.qty) {
        throw errors.conflict('This action ID was previously used for a different collection.')
      }
      return { collected: previous.qty, duplicate: true, collectionId: previous.id }
    }
    const currentOrder = await tx.order.findUnique({ where: { id: order.id }, select: { status: true,
      event: { select: { status: true } },
    } })
    if (!currentOrder || currentOrder.status !== 'PAID' || currentOrder.event.status === 'CANCELLED') throw errors.conflict('This order can no longer be collected.')
    if (line.status !== 'PAID') throw errors.conflict('This souvenir was not confirmed as paid.')
    const entitlement = await tx.merchandiseCollectionEntitlement.findUnique({ where: { id: line.entitlement.id } })
    if (!entitlement) throw errors.notFound('Entitlement no longer exists.')
    const beforeStatus = entitlement.status as MerchandiseStatus
    let after
    try {
      after = transitionMerchandise({ status: beforeStatus,
        qtyPurchased: entitlement.qtyPurchased, qtyCollected: entitlement.qtyCollected,
        qtyRefunded: entitlement.qtyRefunded,
      }, 'COLLECT', input.qty)
    } catch { throw errors.conflict('Items already collected, refunded or exceed the remaining quantity.') }
    await tx.merchandiseCollectionEntitlement.update({ where: { id: entitlement.id }, data: {
      status: after.status, qtyCollected: after.qtyCollected,
      ...(after.status === 'COLLECTED' ? { collectedAt: new Date() } : {}),
    } })
    await tx.eventSouvenirProduct.update({ where: { id: line.productId }, data: { stockFulfilled: { increment: input.qty } } })
    const collection = await tx.merchandiseCollectionAction.create({ data: {
      entitlementId: entitlement.id, actorUserId: input.userId, idempotencyKey: input.clientActionId,
      action: 'COLLECT', qty: input.qty, beforeStatus, afterStatus: after.status,
    } })
    return { collected: input.qty, duplicate: false, collectionId: collection.id,
      remaining: entitlement.qtyPurchased - after.qtyCollected - after.qtyRefunded }
  })
}
