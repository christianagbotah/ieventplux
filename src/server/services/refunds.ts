import { db } from '../../lib/db'
import { errors } from '../api'
import { postJournal, ensureOrgAccounts, ensurePlatformAccounts } from '../ledger'
import { notifyUser } from './notify'

/**
 * Refunds & payouts.
 *
 * Hubtel's currently documented refund capability covers full-order mobile-money
 * refunds with eligibility limits. Partial/card refunds are NOT advertised —
 * unsupported requests become clearly-labelled MANUAL_TRACKED cases with
 * evidence, never fake money movement. See docs/PAYMENTS_AND_SETTLEMENTS.md.
 */

export async function requestRefund(params: { orderId: string; requestedBy: string; reason: string; ticketIds?: string[] }) {
  const order = await db.order.findUnique({ where: { id: params.orderId }, include: { tickets: true } })
  if (!order) throw errors.notFound('Order not found.')
  if (!['PAID', 'EXCEPTION_REVIEW', 'PARTIALLY_REFUNDED'].includes(order.status)) throw errors.conflict('Only paid orders can be refunded.')
  const existing = await db.refundCase.findFirst({ where: { orderId: order.id, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSED'] } } })
  if (existing) throw errors.conflict('A refund case is already open for this order.')
  const alreadyRefunded = await db.refundCase.aggregate({
    where: { orderId: order.id, status: 'PROCESSED' },
    _sum: { amountMinor: true },
  })
  const refundedSoFar = alreadyRefunded._sum.amountMinor ?? 0
  const remaining = order.totalMinor - refundedSoFar
  if (remaining <= 0) throw errors.conflict('This order is already fully refunded.')
  const refundCase = await db.refundCase.create({
    data: {
      orderId: order.id,
      requestedBy: params.requestedBy,
      type: 'FULL',
      amountMinor: remaining,
      status: 'REQUESTED',
      reason: params.reason.slice(0, 500),
      ticketIds: JSON.stringify(params.ticketIds ?? order.tickets.filter((t) => t.status === 'VALID').map((t) => t.id)),
    },
  })
  await db.order.update({ where: { id: order.id }, data: { status: 'REFUND_PENDING' } })
  return refundCase
}

export async function processRefund(refundCaseId: string, actorId: string) {
  const rc = await db.refundCase.findUnique({ where: { id: refundCaseId }, include: { order: { include: { event: { select: { title: true } } } } } })
  if (!rc) throw errors.notFound('Refund case not found.')
  if (rc.status === 'PROCESSED') throw errors.conflict('Refund already processed — repeated refunds are blocked.')

  // Provider submission for full-order refunds (Hubtel mobile-money refunds).
  // The dev simulator executes the reversal journal; the real adapter path is
  // documented and requires sandbox verification before live use.
  const { env } = await import('../env')
  let providerRefundId: string | null = null
  if (env.paymentsSimulator) {
    providerRefundId = `SIMRF-${Date.now()}`
  } else {
    // Hubtel refunds are initiated from the merchant dashboard/API per the refunds guide.
    // Until sandbox-verified, mark the case MANUAL_TRACKED rather than inventing an endpoint.
    await db.refundCase.update({
      where: { id: rc.id },
      data: { status: 'MANUAL_TRACKED', resolutionNote: 'Provider refund endpoint pending sandbox verification — tracked for manual completion with evidence.' },
    })
    return { status: 'MANUAL_TRACKED' as const }
  }

  // Revoke unused tickets first (entitlement removal precedes money reversal confirmation).
  const ticketIds = JSON.parse(rc.ticketIds || '[]') as string[]
  await db.ticket.updateMany({ where: { id: { in: ticketIds }, status: 'VALID' }, data: { status: 'REFUNDED' } })

  // Reverse the ledger effects of the original payment journal.
  const originalJournal = await db.ledgerJournal.findFirst({ where: { refType: 'ORDER_PAYMENT', refId: rc.orderId }, include: { entries: true } })
  let journalId: string | null = null
  if (originalJournal) {
    const { postJournalByAccountIds } = await import('../ledger')
    const reversal = await postJournalByAccountIds({
      idempotencyKey: `refund:${rc.id}`,
      orgId: originalJournal.orgId,
      refType: 'REFUND',
      refId: rc.id,
      memo: `Refund for order ${rc.order.reference}`,
      createdBy: actorId,
      lines: originalJournal.entries.map((e) => ({
        accountId: e.accountId,
        direction: e.direction === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
        amountMinor: e.amountMinor,
      })),
    })
    journalId = reversal?.journalId ?? null
  }

  await db.refundCase.update({
    where: { id: rc.id },
    data: { status: 'PROCESSED', processedAt: new Date(), providerRefundId, journalId },
  })
  await db.order.update({ where: { id: rc.orderId }, data: { status: 'REFUNDED' } })

  if (rc.order.userId) {
    await notifyUser({
      userId: rc.order.userId,
      type: 'REFUND_PROCESSED',
      title: 'Refund processed',
      body: `Your refund for ${rc.order.event?.title ?? rc.order.reference} has been processed.`,
      link: `#/order/${rc.order.reference}`,
    }).catch(() => {})
  }
  return { status: 'PROCESSED' as const, journalId }
}

// ── Payouts ────────────────────────────────────────────────────────────────

export async function requestPayout(params: { orgId: string; requestedBy: string; amountMinor: number; destination: { momoNumber: string; recipientName: string } }) {
  const { orgFinanceSummary } = await import('../ledger')
  const summary = await orgFinanceSummary(params.orgId)
  if (params.amountMinor <= 0) throw errors.badRequest('Payout amount must be positive.')
  if (params.amountMinor > summary.availablePayoutMinor) {
    throw errors.conflict(`Payout exceeds available balance (${summary.availablePayoutMinor} minor units available).`)
  }
  const payout = await db.payout.create({
    data: {
      orgId: params.orgId,
      requestedBy: params.requestedBy,
      amountMinor: params.amountMinor,
      destination: JSON.stringify({ momoNumber: params.destination.momoNumber, recipientName: params.destination.recipientName }),
      status: 'REQUESTED',
    },
  })
  return payout
}

export async function approvePayout(payoutId: string, approverId: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw errors.notFound('Payout not found.')
  if (payout.status !== 'REQUESTED') throw errors.conflict('Payout is not awaiting approval.')
  // Hold the funds while the payout is in flight.
  await db.settlementHold.create({ data: { orgId: payout.orgId, reason: `Payout ${payout.id} in flight`, amountMinor: payout.amountMinor } })
  await db.payout.update({ where: { id: payout.id }, data: { status: 'APPROVED', approvedBy: approverId } })
}

export async function submitPayout(payoutId: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw errors.notFound('Payout not found.')
  if (payout.status !== 'APPROVED') throw errors.conflict('Payout must be approved before submission.')
  const { submitPayout: providerSubmit } = await import('../hubtel/payments')
  const destination = JSON.parse(payout.destination || '{}') as { momoNumber: string; recipientName: string }
  const result = await providerSubmit({
    reference: payout.id,
    amountMinor: payout.amountMinor,
    momoNumber: destination.momoNumber ?? '',
    recipientName: destination.recipientName ?? '',
    currency: payout.currency,
  })
  if (!result.ok) {
    // Blocked (no credentials/contract): stays APPROVED with the blocker recorded. Never retried with a fresh reference.
    await db.payout.update({ where: { id: payout.id }, data: { failureReason: result.error } })
    return { submitted: false, error: result.error }
  }
  await ensureOrgAccounts(payout.orgId)
  await ensurePlatformAccounts()
  const journal = await postJournal({
    idempotencyKey: `payout:${payout.id}`,
    orgId: payout.orgId,
    refType: 'PAYOUT',
    refId: payout.id,
    memo: `Organizer payout ${payout.id}`,
    createdBy: 'system:payout',
    lines: [
      { accountCode: 'organizer_payable', orgScoped: true, direction: 'DEBIT', amountMinor: payout.amountMinor },
      { accountCode: 'payouts_clearing', orgScoped: false, direction: 'CREDIT', amountMinor: payout.amountMinor },
    ],
  })
  await db.payout.update({
    where: { id: payout.id },
    data: { status: 'SUBMITTED', submittedAt: new Date(), providerRef: result.providerRef, journalId: journal?.journalId },
  })
  return { submitted: true }
}

export async function markPayoutPaid(payoutId: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout || payout.status !== 'SUBMITTED') throw errors.conflict('Payout is not submitted.')
  await db.payout.update({ where: { id: payout.id }, data: { status: 'PAID', reconciledAt: new Date() } })
  // Release the in-flight hold.
  await db.settlementHold.updateMany({ where: { orgId: payout.orgId, reason: `Payout ${payout.id} in flight`, releasedAt: null }, data: { releasedAt: new Date() } })
}

export async function failPayout(payoutId: string, reason: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout || !['SUBMITTED'].includes(payout.status)) throw errors.conflict('Payout is not submitted.')
  // Reversal journal returns the money to organizer_payable; retry uses the SAME payout reference.
  if (payout.journalId) {
    const { postJournalByAccountIds } = await import('../ledger')
    const original = await db.ledgerJournal.findUnique({ where: { id: payout.journalId }, include: { entries: true } })
    if (original) {
      const reversal = await postJournalByAccountIds({
        idempotencyKey: `payout-reversal:${payout.id}`,
        orgId: payout.orgId,
        refType: 'PAYOUT_REVERSAL',
        refId: payout.id,
        memo: `Failed payout reversal ${payout.id}`,
        createdBy: 'system:payout',
        lines: original.entries.map((e) => ({
          accountId: e.accountId,
          direction: e.direction === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
          amountMinor: e.amountMinor,
        })),
      })
      await db.payout.update({ where: { id: payout.id }, data: { status: 'FAILED', failureReason: reason, reversalJournalId: reversal?.journalId } })
      await db.settlementHold.updateMany({ where: { orgId: payout.orgId, reason: `Payout ${payout.id} in flight`, releasedAt: null }, data: { releasedAt: new Date() } })
      return
    }
  }
  await db.payout.update({ where: { id: payout.id }, data: { status: 'FAILED', failureReason: reason } })
  await db.settlementHold.updateMany({ where: { orgId: payout.orgId, reason: `Payout ${payout.id} in flight`, releasedAt: null }, data: { releasedAt: new Date() } })
}
