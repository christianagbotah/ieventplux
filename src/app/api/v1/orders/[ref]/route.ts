import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { fulfilFreeOrder } from '@/server/services/fulfilment'
import { formatMoney } from '@/server/money'

type RouteContext = { params: Promise<{ ref: string }> }

/** GET /api/v1/orders/[ref] — buyer or org view of one order. */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { ref } = await ctx.params
    const order = await db.order.findUnique({
      where: { reference: ref },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, timezone: true, coverImageUrl: true, venue: { select: { name: true, city: true } }, org: { select: { name: true, slug: true } } } },
        items: { include: { ticketType: { select: { name: true, kind: true } } } },
        tickets: { select: { id: true, code: true, status: true, ticketTypeId: true } },
        payments: true,
        // Refund lifecycle visible to the buyer/org staff (both already gated above).
        refundCases: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, type: true, amountMinor: true, reason: true, resolutionNote: true, createdAt: true, processedAt: true } },
      },
    })
    if (!order) throw errors.notFound('Order not found.')

    // Access control: the buyer, or the organizing org's staff.
    const session = await getSession()
    let allowed = false
    if (session) {
      if (order.userId === session.user.id) allowed = true
      else {
        const membership = await db.membership.findFirst({ where: { userId: session.user.id, orgId: order.orgId } })
        if (membership) allowed = true
      }
    }
    if (!allowed) throw errors.forbidden('You do not have access to this order.')

    return jsonOk({
      order: {
        ...order,
        totalLabel: formatMoney(order.totalMinor, order.currency),
        subtotalLabel: formatMoney(order.subtotalMinor, order.currency),
        feeLabel: formatMoney(order.platformFeeMinor, order.currency),
      },
    })
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
    if (order.userId && order.userId !== user.id) throw errors.forbidden('This order belongs to another buyer.')
    if (order.totalMinor !== 0) throw errors.conflict('This order requires payment.')
    const result = await fulfilFreeOrder(order.id)
    return jsonOk({ ...result, reference: ref })
  })
}
