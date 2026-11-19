import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { verifySouvenirCollectionToken } from '@/server/souvenir-policy'

type Context = { params: Promise<{ token: string }> }

/** Smartphone QR contains only a signed order reference; an authenticated,
 * event-authorized staff session is required to view or redeem it. */
async function authorizedOrder(userId: string, token: string) {
  const reference = verifySouvenirCollectionToken(token)
  if (!reference) throw errors.notFound('Invalid collection QR or receipt reference.')
  const order = await db.order.findUnique({
    where: { reference },
    select: {
      id: true, eventId: true, reference: true, status: true, paidAt: true,
      buyerName: true, event: { select: { title: true, startsAt: true, city: true } },
      souvenirItems: {
        select: { id: true, qty: true, collectedQty: true, lineTotalMinor: true, holdStatus: true,
          product: { select: { id: true, name: true, sku: true, variantLabel: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order || !order.souvenirItems.length) throw errors.notFound('No souvenir receipt found.')
  const access = await eventOrgAccess(userId, order.eventId, 'checkin:scan')
  if (!access.allowed) throw errors.forbidden('Only authorized event collection or check-in staff may review this receipt.')
  return order
}

export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const user = await requireUser()
    const { token } = await ctx.params
    const order = await authorizedOrder(user.id, token)
    return jsonOk({
      receipt: {
        ...order,
        collectionAllowed: order.status === 'PAID' && order.souvenirItems.every((item) => item.holdStatus === 'CONSUMED'),
        items: order.souvenirItems.map(({ product, ...item }) => ({ ...item, product,
          remaining: Math.max(0, item.qty - item.collectedQty) })),
        souvenirItems: undefined,
      },
      note: 'Ticket admission is independent. QR lookup does not redeem or grant entry.',
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'souvenir-collection', 80, 60_000)
    const user = await requireUser()
    const { token } = await ctx.params
    const order = await authorizedOrder(user.id, token)
    if (order.status !== 'PAID') throw errors.conflict('Only a verified, fully paid receipt is eligible for collection.')
    const body = await readJson<Record<string, unknown>>(req)
    const itemId = typeof body.itemId === 'string' ? body.itemId : ''
    const actionId = typeof body.clientActionId === 'string' ? body.clientActionId : ''
    const qty = body.qty
    if (!order.souvenirItems.some((item) => item.id === itemId)) throw errors.notFound('Souvenir line not found in this receipt.')
    if (!Number.isSafeInteger(qty) || (qty as number) < 1 || (qty as number) > 20) throw errors.badRequest('Collection quantity must be between 1 and 20.')
    if (!/^[a-f0-9-]{36}$/i.test(actionId)) throw errors.badRequest('A unique collection action ID is required.')
    if (body.confirm !== true) throw errors.badRequest('Confirm the customer has physically received the selected items.')

    const result = await db.$transaction(async (tx) => {
      // A serializable idempotency lock per client action prevents duplicate
      // submission and reduces accidental re-collection from mobile retries.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actionId}), hashtext('souvenir-collection'))`
      const old = await tx.souvenirCollection.findUnique({ where: { clientActionId: actionId } })
      if (old) {
        if (old.orderItemId !== itemId || old.qty !== qty) throw errors.conflict('Collection request ID has already been used for a different action.')
        return { id: old.id, status: 'ALREADY_RECORDED', qty: old.qty }
      }
      const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } })
      if (fresh?.status !== 'PAID') throw errors.conflict('Receipt is not fully paid or is under refund review.')
      // Atomic row update enforces no overcollection even with two different
      // staff devices submitting at the same time.
      const updated = await tx.$executeRaw`
        UPDATE "SouvenirOrderItem"
        SET "collectedQty" = "collectedQty" + ${qty as number}, "updatedAt" = NOW()
        WHERE "id" = ${itemId} AND "orderId" = ${order.id}
          AND "holdStatus" = 'CONSUMED' AND "collectedQty" + ${qty as number} <= "qty"
      `
      if (updated !== 1) throw errors.conflict('These items have already been collected, or the selected quantity exceeds what remains.')
      const item = await tx.souvenirOrderItem.findUniqueOrThrow({ where: { id: itemId }, select: { productId: true } })
      await tx.eventSouvenirProduct.update({ where: { id: item.productId }, data: { stockFulfilled: { increment: qty as number } } })
      const record = await tx.souvenirCollection.create({ data: {
        orderItemId: itemId, eventId: order.eventId, collectorId: user.id,
        qty: qty as number, clientActionId: actionId,
        note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
      } })
      return { id: record.id, status: 'COLLECTED', qty: qty as number }
    })
    return jsonOk({ ...result, note: 'Souvenir handover recorded separately from ticket admission.' })
  })
}
