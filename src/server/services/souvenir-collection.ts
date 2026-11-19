import { db } from '@/lib/db'
import { errors } from '../api'
import { eventOrgAccess } from '../permissions'
import { verifySouvenirCollectionToken, merchandiseCollectionEnabled } from '../souvenir-policy'

/** QR link lookup always requires a logged-in, accepted event staff member.
 * Possessing a copied QR link never authorizes merchandise collection.
 * Ticket admission remains an entirely separate check-in action.
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
  if (!access.allowed) throw errors.forbidden('Only authorized event check-in staff may verify collection receipts.')
  return order
}

export async function getSouvenirCollection(token: string, userId: string) {
  const order = await authorizedOrder(token, userId)
  const lines = await db.souvenirOrderItem.findMany({ where: { orderId: order.id },
    select: { id: true, qty: true, collectedQty: true, unitPriceMinor: true, holdStatus: true,
      product: { select: { name: true, sku: true, variantLabel: true, imageUrl: true } },
    }, orderBy: { createdAt: 'asc' },
  })
  const ticketCount = await db.ticket.count({ where: { orderId: order.id } })
  const admittedCount = await db.ticket.count({ where: { orderId: order.id, status: 'CHECKED_IN' } })
  const canCollect = order.status === 'PAID' && order.event.status !== 'CANCELLED' && lines.some((line) => line.holdStatus === 'CONSUMED' && line.collectedQty < line.qty)
  return { order: { reference: order.reference, buyerName: order.buyerName, status: order.status,
    paidAt: order.paidAt, event: order.event, tickets: ticketCount, admitted: admittedCount,
  }, lines: lines.map((line) => ({ ...line, remaining: Math.max(0, line.qty - line.collectedQty) })), canCollect,
    warning: order.status !== 'PAID' ? 'Payment is not confirmed. Do not release merchandise or grant admission.'
      : order.event.status === 'CANCELLED' ? 'Event cancelled. Collection is blocked pending organizer review.' : null,
    note: 'Receipt verification does not admit any attendee. Ticket admission requires the separate ticket QR check-in process.',
  }
}

export async function collectSouvenirItems(input: { token: string; userId: string; orderItemId: string; qty: number; clientActionId: string }) {
  if (!merchandiseCollectionEnabled()) throw errors.unavailable('MERCH_COLLECTION_DISABLED', 'Merchandise handover is awaiting security and refund QA approval.')
  const order = await authorizedOrder(input.token, input.userId)
  if (!Number.isSafeInteger(input.qty) || input.qty < 1 || input.qty > 20) throw errors.badRequest('Collection quantity must be 1–20.')
  if (!/^[a-z0-9-]{12,70}$/i.test(input.clientActionId)) throw errors.badRequest('A unique collection action ID is required.')
  if (order.status !== 'PAID' || order.event.status === 'CANCELLED') throw errors.conflict('This receipt is not eligible for merchandise collection.')
  if (!/^[a-z0-9]{12,45}$/i.test(input.orderItemId)) throw errors.badRequest('Choose a valid merchandise line.')

  return db.$transaction(async (tx) => {
    // Lock one physical order line before checking remaining collection qty,
    // preserving idempotency across simultaneous phone scans and retries.
    await tx.$queryRaw`SELECT "id" FROM "SouvenirOrderItem" WHERE "id" = ${input.orderItemId} FOR UPDATE`
    const previous = await tx.souvenirCollection.findUnique({ where: { clientActionId: input.clientActionId } })
    if (previous) {
      if (previous.orderItemId !== input.orderItemId || previous.collectorId !== input.userId || previous.qty !== input.qty) {
        throw errors.conflict('This collection action ID was already used for another transaction.')
      }
      return { collected: previous.qty, duplicate: true, collectionId: previous.id }
    }
    const line = await tx.souvenirOrderItem.findFirst({ where: { id: input.orderItemId, orderId: order.id },
      select: { id: true, qty: true, collectedQty: true, holdStatus: true, productId: true },
    })
    const current = await tx.order.findUnique({ where: { id: order.id }, select: { status: true, event: { select: { status: true } } } })
    if (!current || current.status !== 'PAID' || current.event.status === 'CANCELLED') throw errors.conflict('The receipt is no longer eligible for collection.')
    if (!line || line.holdStatus !== 'CONSUMED') throw errors.conflict('This product was not confirmed as paid.')
    if (line.collectedQty + input.qty > line.qty) throw errors.conflict('These items were already collected or the requested quantity exceeds the remaining balance.')
    await tx.souvenirOrderItem.update({ where: { id: line.id }, data: { collectedQty: { increment: input.qty } } })
    await tx.eventSouvenirProduct.update({ where: { id: line.productId }, data: { stockFulfilled: { increment: input.qty } } })
    const collection = await tx.souvenirCollection.create({ data: {
      orderItemId: line.id, eventId: order.eventId, collectorId: input.userId,
      qty: input.qty, clientActionId: input.clientActionId,
    } })
    return { collected: input.qty, duplicate: false, collectionId: collection.id,
      remaining: line.qty - line.collectedQty - input.qty }
  })
}
