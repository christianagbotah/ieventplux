import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { verifySouvenirCollectionToken, souvenirCollectionEnabled } from '@/server/souvenir-policy'

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
    const returned = await db.souvenirReturnIntake.groupBy({
      by: ['orderItemId'],
      where: { orderItemId: { in: order.souvenirItems.map((item) => item.id) }, status: { in: ['RECEIVED', 'ACCEPTED'] } },
      _sum: { qty: true },
    })
    const returnedByLine = new Map(returned.map((item) => [item.orderItemId, item._sum.qty ?? 0]))
    return jsonOk({
      receipt: {
        ...order,
        collectionEnabled: souvenirCollectionEnabled(),
        collectionAllowed: souvenirCollectionEnabled() && order.status === 'PAID' && order.souvenirItems.every((item) => item.holdStatus === 'CONSUMED'),
        items: order.souvenirItems.map(({ product, ...item }) => ({ ...item, product,
          remaining: Math.max(0, item.qty - item.collectedQty),
          returnableQty: Math.max(0, item.collectedQty - (returnedByLine.get(item.id) ?? 0)) })),
        souvenirItems: undefined,
      },
      note: 'Ticket admission is independent. QR lookup does not redeem or grant entry.',
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    if (!souvenirCollectionEnabled()) throw errors.unavailable('SOUVENIR_COLLECTION_DISABLED', 'Souvenir handover is not yet enabled.')
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

    const { collectSouvenirItem } = await import('@/server/services/souvenir-collection')
    const result = await collectSouvenirItem({
      orderId: order.id,
      eventId: order.eventId,
      orderItemId: itemId,
      collectorId: user.id,
      qty: qty as number,
      clientActionId: actionId,
      note: typeof body.note === 'string' ? body.note : null,
    })
    return jsonOk({ ...result, note: 'Souvenir handover recorded separately from ticket admission.' })
  })
}
