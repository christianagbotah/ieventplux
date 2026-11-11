import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'
import { paymentReference } from '@/server/ids'
import { env } from '@/server/env'
import { initiateCheckout } from '@/server/hubtel/payments'

/**
 * POST /api/v1/subscriptions/purchase — buy/renew a plan.
 * Creates a DUE invoice + payment attempt through the same Hubtel checkout path
 * as ticket orders (callback → worker → activateSubscription + SUBSCRIPTION journal).
 * Auto-renewal is intentionally NOT implemented: it requires an officially supported
 * provider flow with customer consent — organizers renew explicitly with reminders.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<{ orgId?: string; planId?: string }>(req)
    const orgId = String(body.orgId ?? '')
    const planId = String(body.planId ?? '')
    const membership = await membershipFor(user.id, orgId)
    if (!membership || !orgCan(membership.role, 'org:manage')) throw errors.forbidden('Plan changes require an organization admin role.')
    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
    if (!plan || !plan.active) throw errors.notFound('Plan not found.')
    if (plan.priceMinor <= 0) {
      const { activateSubscription } = await import('@/server/services/subscriptions')
      const result = await activateSubscription(orgId, planId)
      return jsonOk({ activated: true, free: true, currentPeriodEnd: result.currentPeriodEnd })
    }

    const invoice = await db.invoice.create({
      data: {
        orgId,
        number: `INV-${Date.now().toString(36).toUpperCase()}-${orgId.slice(-4).toUpperCase()}`,
        description: `${plan.name} plan (${plan.billingPeriodDays} days)`,
        amountMinor: plan.priceMinor,
        status: 'DUE',
      },
    })
    const reference = paymentReference(invoice.number.replace(/[^A-Z0-9]/g, ''), 1)
    const provider = env.paymentsSimulator ? 'SIMULATOR' : 'HUBTEL'
    const attempt = await db.paymentAttempt.create({
      data: { invoiceId: invoice.id, attemptNo: 1, provider, reference, status: 'INITIATED', amountMinor: plan.priceMinor, currency: plan.currency },
    })
    const result = await initiateCheckout({
      reference,
      description: `iEventPlux ${plan.name} subscription`,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      callbackUrl: `${env.appUrl}/api/v1/payments/callback`,
      returnUrl: `${env.appUrl}/api/v1/payments/return/${reference}`,
      cancellationUrl: `${env.appUrl}/api/v1/payments/return/${reference}?cancelled=1`,
      buyerEmail: user.email,
    })
    if (!result.ok) {
      await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: result.error } })
      throw errors.unavailable('PAYMENT_INITIATION_FAILED', `Could not start checkout: ${result.error}`)
    }
    const checkoutUrl = provider === 'SIMULATOR' ? `/api/v1/payments/simulator/${reference}` : (result.checkoutUrl as string)
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { checkoutUrl, status: 'REDIRECTED', redirectedAt: new Date(), providerToken: result.token ?? reference } })
    return jsonOk({ invoice: { id: invoice.id, number: invoice.number, amountMinor: invoice.amountMinor }, checkoutUrl, provider, simulated: provider === 'SIMULATOR' })
  })
}

/** GET /api/v1/subscriptions/plans */
export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    const plans = await db.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    return jsonOk({ items: plans.map((p) => ({ ...p, entitlements: JSON.parse(p.entitlements || '{}') })) })
  })
}
