import { db } from '../../lib/db'
import { env } from '../env'
import { errors } from '../api'
import { paymentReference } from '../ids'
import { initiateCheckout } from '../hubtel/payments'
import { enqueue } from '../outbox'

/**
 * Payment orchestration: attempt creation, provider initiation, callback intake.
 * The browser return URL is informational only — payment state changes exclusively
 * through provider callbacks or authenticated reconciliation.
 */

export async function initiatePaymentForOrder(orderRef: string, userId?: string | null) {
  const order = await db.order.findUnique({ where: { reference: orderRef }, include: { event: true, payments: true } })
  if (!order) throw errors.notFound('Order not found.')
  if (order.userId && userId && order.userId !== userId) throw errors.forbidden('This order belongs to another buyer.')
  if (order.status !== 'PENDING_PAYMENT') throw errors.conflict(`Order is ${order.status.toLowerCase().replace('_', ' ')} — payment is not required or no longer possible.`)
  if (order.expiresAt && order.expiresAt < new Date()) {
    // Re-arm the hold window if capacity still allows a retry.
    await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() + 5 * 60_000), status: 'PENDING_PAYMENT' } })
  }
  const active = order.payments.filter((p) => ['INITIATED', 'REDIRECTED', 'PENDING'].includes(p.status))
  if (active.length > 0) {
    const latest = active.sort((a, b) => b.attemptNo - a.attemptNo)[0]
    if (latest.checkoutUrl) return { attemptId: latest.id, checkoutUrl: latest.checkoutUrl, provider: latest.provider, existing: true }
  }

  const attemptNo = order.payments.length + 1
  const reference = paymentReference(order.reference, attemptNo)
  // Round 14: the simulator gate is dynamic — admin-saved Hubtel credentials
  // (DB) activate the real provider immediately, no redeploy needed.
  const { resolveHubtelCreds, paymentsSimulatorActive } = await import('../hubtel/credentials')
  const creds = await resolveHubtelCreds()
  const provider = paymentsSimulatorActive(creds) ? 'SIMULATOR' : 'HUBTEL'

  const callbackUrl = `${env.appUrl}/api/v1/payments/callback`
  const returnUrl = `${env.appUrl}/api/v1/payments/return/${reference}`
  const cancellationUrl = `${env.appUrl}/api/v1/payments/return/${reference}?cancelled=1`

  const attempt = await db.paymentAttempt.create({
    data: {
      orderId: order.id,
      attemptNo,
      provider,
      reference,
      status: 'INITIATED',
      amountMinor: order.totalMinor,
      currency: order.currency,
    },
  })

  const result = await initiateCheckout(
    {
      reference,
      description: `iEventPlux — ${order.event.title}`,
      amountMinor: order.totalMinor,
      currency: order.currency,
      callbackUrl,
      returnUrl,
      cancellationUrl,
      buyerPhone: order.buyerPhone,
      buyerEmail: order.buyerEmail,
    },
    creds,
  )

  if (!result.ok) {
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: result.error } })
    throw errors.unavailable('PAYMENT_INITIATION_FAILED', `Could not start checkout: ${result.error}`)
  }

  const checkoutUrl =
    provider === 'SIMULATOR'
      ? `/api/v1/payments/simulator/${reference}`
      : (result.checkoutUrl as string)

  await db.paymentAttempt.update({
    where: { id: attempt.id },
    data: { checkoutUrl, providerToken: result.token ?? reference, status: 'REDIRECTED', redirectedAt: new Date() },
  })

  return { attemptId: attempt.id, checkoutUrl, provider, simulated: provider === 'SIMULATOR' }
}

/**
 * Callback intake: durable storage + prompt 200 ack. Business effects are
 * processed by the worker (PROCESS_PROVIDER_EVENT) idempotently.
 */
export async function intakeCallback(payload: Record<string, unknown>) {
  const { parseCallback } = await import('../hubtel/payments')
  const parsed = parseCallback(payload as never)

  const attempt = parsed.reference
    ? await db.paymentAttempt.findUnique({ where: { reference: parsed.reference } })
    : null

  if (!attempt) {
    // Unknown reference — stored for forensics, never fulfils anything.
    await db.providerEvent.create({
      data: {
        provider: 'HUBTEL',
        eventType: 'CALLBACK',
        reference: parsed.reference,
        providerPaymentId: parsed.providerPaymentId,
        dedupKey: parsed.dedupKey,
        payload: parsed.redactedPayload,
        status: 'REJECTED',
        errorNote: 'Unknown payment reference',
      },
    }).catch(() => {})
    return { acknowledged: true, result: 'UNKNOWN_REFERENCE' as const }
  }

  const existing = await db.providerEvent.findUnique({ where: { dedupKey: parsed.dedupKey } })
  if (existing) {
    return { acknowledged: true, result: 'DUPLICATE' as const }
  }

  const event = await db.providerEvent.create({
    data: {
      provider: attempt.provider,
      eventType: 'CALLBACK',
      reference: parsed.reference,
      providerPaymentId: parsed.providerPaymentId,
      dedupKey: parsed.dedupKey,
      payload: parsed.redactedPayload,
    },
  })
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { callbackCount: { increment: 1 }, status: attempt.status === 'INITIATED' ? 'PENDING' : attempt.status } })
  await enqueue('PROCESS_PROVIDER_EVENT', { providerEventId: event.id })
  return { acknowledged: true, result: 'STORED' as const }
}

/** Process one stored provider event (worker). Idempotent — supports order AND subscription invoice payments. */
export async function processProviderEvent(providerEventId: string) {
  const pe = await db.providerEvent.findUnique({ where: { id: providerEventId } })
  if (!pe || pe.status === 'PROCESSED') return { skipped: true }
  const attempt = pe.reference ? await db.paymentAttempt.findUnique({ where: { reference: pe.reference } }) : null
  if (!attempt) {
    await db.providerEvent.update({ where: { id: pe.id }, data: { status: 'REJECTED', errorNote: 'No matching attempt' } })
    return { skipped: true }
  }
  let parsed: { outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN'; amountMinor: number | null }
  try {
    const raw = JSON.parse(pe.payload) as Record<string, unknown>
    const { parseCallback } = await import('../hubtel/payments')
    const p = parseCallback(raw as never)
    parsed = { outcome: p.outcome, amountMinor: p.amountMinor }
  } catch {
    parsed = { outcome: 'UNKNOWN', amountMinor: null }
  }

  // Subscription invoice payments (no order attached).
  if (!attempt.orderId) {
    const result = await applySubscriptionPayment({ attemptId: attempt.id, outcome: parsed.outcome, amountMinor: parsed.amountMinor, providerPaymentId: pe.providerPaymentId })
    await db.providerEvent.update({ where: { id: pe.id }, data: { status: 'PROCESSED', processedAt: new Date() } })
    return { outcome: result }
  }

  const { applyProviderOutcome } = await import('./fulfilment')
  const outcome = await applyProviderOutcome({
    attemptId: attempt.id,
    outcome: parsed.outcome,
    amountMinor: parsed.amountMinor,
    providerPaymentId: pe.providerPaymentId,
    source: 'CALLBACK',
  })
  await db.providerEvent.update({ where: { id: pe.id }, data: { status: 'PROCESSED', processedAt: new Date() } })
  return { outcome }
}

/** Subscription payment fulfilment (idempotent). */
export async function applySubscriptionPayment(params: {
  attemptId: string
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN'
  amountMinor: number | null
  providerPaymentId?: string | null
}): Promise<'ACTIVATED' | 'FAILED' | 'PENDING' | 'REJECTED'> {
  const attempt = await db.paymentAttempt.findUnique({ where: { id: params.attemptId }, include: { order: true } })
  if (!attempt?.invoiceId) return 'FAILED'
  const invoice = await db.invoice.findUnique({ where: { id: attempt.invoiceId }, include: { subscription: true, org: true } })
  if (!invoice) return 'FAILED'

  if (params.outcome === 'SUCCESS') {
    if (params.amountMinor !== null && params.amountMinor !== attempt.amountMinor) {
      await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'UNKNOWN', failureReason: 'Amount mismatch' } })
      return 'REJECTED'
    }
    if (attempt.status === 'SUCCESS') return 'PENDING' // already processed
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCESS', verifiedAt: new Date(), providerPaymentId: params.providerPaymentId ?? null } })
    if (invoice.status !== 'PAID') {
      await db.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAt: new Date() } })
      const { activateSubscription } = await import('./subscriptions')
      await activateSubscription(invoice.orgId, invoice.subscription?.planId ?? '', undefined)
      const { ensureOrgAccounts, ensurePlatformAccounts, postJournal } = await import('../ledger')
      await ensureOrgAccounts(invoice.orgId)
      await ensurePlatformAccounts()
      await postJournal({
        idempotencyKey: `subscription-payment:${attempt.id}`,
        orgId: invoice.orgId,
        refType: 'SUBSCRIPTION',
        refId: invoice.id,
        memo: `Subscription payment ${invoice.number}`,
        createdBy: 'system:subscription',
        lines: [
          { accountCode: 'collections', orgScoped: false, direction: 'DEBIT', amountMinor: attempt.amountMinor },
          { accountCode: 'subscriptions_revenue', orgScoped: false, direction: 'CREDIT', amountMinor: attempt.amountMinor },
        ],
      })
      const { notifyUser } = await import('./notify')
      const org = await db.organization.findUnique({ where: { id: invoice.orgId } })
      if (org) {
        await notifyUser({ userId: org.ownerId, type: 'SUBSCRIPTION', title: 'Subscription active', body: 'Your plan is now active.', link: '#/organizer?tab=billing' }).catch(() => {})
      }
    }
    return 'ACTIVATED'
  }
  if (params.outcome === 'FAILURE') {
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: 'Provider reported failure' } })
    return 'FAILED'
  }
  return 'PENDING'
}

/** Reconciliation sweep (documented ≥5-minute status-check rule). */
export async function reconcilePayments() {
  const settings = (await import('../settings')).DEFAULT_SETTINGS
  const cutoff = new Date(Date.now() - settings.reconcileAfterMinutes * 60_000)
  const candidates = await db.paymentAttempt.findMany({
    where: {
      status: { in: ['REDIRECTED', 'PENDING'] },
      initiatedAt: { lt: cutoff },
      reconcileCheckCount: { lt: settings.maxReconcileChecks },
      callbackCount: 0,
    },
    take: 25,
  })
  const results: { reference: string; outcome: string }[] = []
  for (const attempt of candidates) {
    const { checkTransactionStatus } = await import('../hubtel/payments')
    const status = await checkTransactionStatus(attempt.reference, attempt.providerToken)
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: { reconcileCheckCount: { increment: 1 }, lastReconciledAt: new Date() },
    })
    if (!status.ok || status.outcome === 'PENDING' || status.outcome === 'UNKNOWN') {
      if (attempt.reconcileCheckCount + 1 >= settings.maxReconcileChecks && status.outcome !== 'SUCCESS') {
        // Still unresolved after bounded checks → mark UNKNOWN and surface in the ops queue.
        await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'UNKNOWN', failureReason: 'Unresolved after maximum reconciliation checks' } })
        results.push({ reference: attempt.reference, outcome: 'UNKNOWN' })
      } else {
        results.push({ reference: attempt.reference, outcome: 'STILL_PENDING' })
      }
      continue
    }
    const { applyProviderOutcome } = await import('./fulfilment')
    const applied = await applyProviderOutcome({
      attemptId: attempt.id,
      outcome: status.outcome,
      amountMinor: status.amountMinor,
      providerPaymentId: status.providerPaymentId,
      source: 'RECONCILE',
    })
    results.push({ reference: attempt.reference, outcome: applied.outcome })
  }
  return { checked: candidates.length, results }
}
