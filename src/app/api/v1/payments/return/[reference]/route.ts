import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/v1/payments/return/[reference] — browser return/cancellation landing.
 *
 * IMPORTANT: this endpoint is INFORMATIONAL ONLY. A browser return never marks an
 * order paid. The authoritative state comes from the provider callback (processed
 * by the worker) or authenticated reconciliation. The page polls order status so
 * the buyer sees the true state.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params
  const cancelled = new URL(req.url).searchParams.get('cancelled') === '1'
  const attempt = await db.paymentAttempt.findUnique({ where: { reference }, include: { order: true } }).catch(() => null)
  const target = attempt?.order
    ? `/#/order/${attempt.order.reference}?payment=return&cancelled=${cancelled ? '1' : '0'}`
    : `/#/me?tab=orders&payment=return&unknown=1`
  return NextResponse.redirect(new URL(target, new URL(req.url).origin), 302)
}
