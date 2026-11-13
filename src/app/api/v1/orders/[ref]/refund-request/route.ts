import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ ref: string }> }

/**
 * POST /api/v1/orders/[ref]/refund-request — the buyer's own refund request.
 *
 * Honesty contract:
 *  - only the signed-in buyer of this order (guest orders: organizer direct);
 *  - the event must not have ended (post-event goodwill refunds stay organizer-side);
 *  - one open case per order (409); reason is required and sanitized;
 *  - the case lands REQUESTED — the org decides, the platform executes money.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { ref } = await ctx.params
    const user = await requireUser()
    rateLimit(req, 'order-refund-request', 6, 60_000)
    const body = await readJson<{ reason?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)

    const reason = sanitizeText(body.reason, 500)
    if (reason.length < 10) throw errors.badRequest('Tell the organizer why you need a refund (at least 10 characters).')

    const order = await db.order.findUnique({
      where: { reference: ref },
      select: { id: true, userId: true, orgId: true, event: { select: { title: true, endsAt: true } } },
    })
    if (!order) throw errors.notFound('Order not found.')
    if (order.userId !== user.id) {
      throw errors.forbidden('Only the signed-in buyer of this order can request a refund. Guest orders are handled by the organizer directly.')
    }
    if (order.event.endsAt && new Date(order.event.endsAt) <= new Date()) {
      throw errors.conflict('This event has already ended — refunds are handled by the organizer directly.')
    }

    const { requestRefund } = await import('@/server/services/refunds')
    const rc = await requestRefund({ orderId: order.id, requestedBy: user.id, reason })

    // Ring the org's finance bell: buyer-requested cases need a human decision.
    const financeMembers = await db.membership.findMany({
      where: { orgId: order.orgId, role: { in: ['OWNER', 'ADMIN', 'FINANCE'] } },
      select: { userId: true },
    })
    const { notifyUser } = await import('@/server/services/notify')
    for (const m of financeMembers) {
      await notifyUser({
        userId: m.userId,
        type: 'REFUND_REQUESTED',
        title: 'Refund requested',
        body: `${user.displayName} requested a refund for ${order.event.title}. Review it in Finance → Refund cases.`,
        link: '#/organizer?tab=finance',
      }).catch(() => {})
    }

    const { audit } = await import('@/server/audit')
    await audit({
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'order.refund_request',
      entityType: 'RefundCase',
      entityId: rc.id,
      after: { orderId: order.id, amountMinor: rc.amountMinor, requestedBy: user.id },
    })
    return jsonOk({ refundCase: { id: rc.id, status: rc.status, amountMinor: rc.amountMinor, reason: rc.reason } })
  })
}
