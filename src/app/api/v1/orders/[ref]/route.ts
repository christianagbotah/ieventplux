import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'
import { canReadFullOrder } from '@/server/order-access'
import { fulfilFreeOrder } from '@/server/services/fulfilment'
import { formatMoney } from '@/server/money'

type RouteContext = { params: Promise<{ ref: string }> }

/** GET /api/v1/orders/[ref] — buyer or org view of one order. */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { ref } = await ctx.params
    const user = await requireUser()
    const order = await db.order.findUnique({
      where: { reference: ref },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, timezone: true, coverImageUrl: true, venue: { select: { name: true, city: true } }, org: { select: { name: true, slug: true } } } },
        items: { include: { ticketType: { select: { name: true, kind: true } } } },
        tickets: { select: { id: true, code: true, status: true, ticketTypeId: true } },
        // Restrict response to status fields actually shown by the receipt UI.
        // Never return provider tokens, private gateway IDs or raw callback blobs.
        payments: { select: { id: true, status: true, provider: true, attemptNo: true, reference: true } },
        // Refund lifecycle visible to the buyer/org staff (both already gated above).
        refundCases: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, type: true, amountMinor: true, reason: true, resolutionNote: true, createdAt: true, processedAt: true } },
      },
    })
    if (!order) throw errors.notFound('Order not found.')

    // A full receipt exposes buyer identity and ticket credentials. Only the
    // buyer or accepted organization staff authorized to view orders may read it.
    if (!(await canReadFullOrder(user.id, order))) throw errors.forbidden('You do not have access to this order.')

    return jsonOk({
      order: {
        ...order,
        totalLabel: formatMoney(order.totalMinor, order.currency),
        subtotalLabel: formatMoney(order.subtotalMinor, order.currency),
        feeLabel: formatMoney(order.platformFeeMinor, order.currency),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

/** POST /api/v1/orders/[ref]/confirm-free — finalize a free RSVP order (issues tickets without payment). */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { ref } = await ctx.params
    const user = await requireUser()
    const order = await db.order.findUnique({ where: { reference: ref } })
    if (!order) throw errors.notFound('Order not found.')
    if (order.userId !== user.id) throw errors.forbidden('Only the original buyer can confirm a free order.')
    if (order.totalMinor !== 0) throw errors.conflict('This order requires payment.')
    const result = await fulfilFreeOrder(order.id)
    return jsonOk({ ...result, reference: ref })
  })
}
