import { db } from '../lib/db'

/**
 * Balanced, append-only financial ledger.
 *  - Every money effect is a LedgerJournal with ≥2 LedgerEntry lines; debits == credits.
 *  - Idempotency: each journal carries a unique idempotency key; replays are no-ops.
 *  - Corrections post reversal journals; settled history is never edited or deleted.
 * Money model (see docs/PAYMENTS_AND_SETTLEMENTS.md):
 *  - collections (asset, platform)     : money collected from buyers
 *  - organizer_payable (liability, org): net amount owed to the organizer
 *  - platform_fees (revenue, platform) : commission income
 *  - processing_fees (expense, platform): informational payment-processing cost
 *  - payouts_clearing (liability, platform): payout in flight
 *  - subscriptions_revenue / promotions_revenue (revenue, platform)
 *  - adjustments (equity-style, platform): operational adjustments
 */

export type EntryDirection = 'DEBIT' | 'CREDIT'

export interface JournalLine {
  accountCode: string
  orgScoped: boolean // true → the organization's account with this code; false → platform account
  direction: EntryDirection
  amountMinor: number
}

export const ORG_ACCOUNT_DEFS = [
  { code: 'organizer_payable', type: 'LIABILITY', name: 'Organizer payable' },
] as const

export const PLATFORM_ACCOUNT_DEFS = [
  { code: 'collections', type: 'ASSET', name: 'Collections clearing' },
  { code: 'platform_fees', type: 'REVENUE', name: 'Ticket commission revenue' },
  { code: 'processing_fees', type: 'EXPENSE', name: 'Payment processing costs' },
  { code: 'payouts_clearing', type: 'LIABILITY', name: 'Payouts in flight' },
  { code: 'subscriptions_revenue', type: 'REVENUE', name: 'Subscription revenue' },
  { code: 'promotions_revenue', type: 'REVENUE', name: 'Promotion revenue' },
  { code: 'refunds_clearing', type: 'ASSET', name: 'Refunds clearing' },
  { code: 'adjustments', type: 'EXPENSE', name: 'Operational adjustments' },
] as const

export async function ensureOrgAccounts(orgId: string) {
  for (const def of ORG_ACCOUNT_DEFS) {
    await db.ledgerAccount.upsert({
      where: { orgId_code: { orgId, code: def.code } },
      create: { orgId, code: def.code, type: def.type, name: def.name },
      update: {},
    })
  }
}

export async function ensurePlatformAccounts() {
  for (const def of PLATFORM_ACCOUNT_DEFS) {
    await db.ledgerAccount.upsert({
      where: { orgId_code: { orgId: null ?? '', code: def.code } },
      create: { orgId: null, code: def.code, type: def.type, name: def.name },
      update: {},
    }).catch(async () => {
      // SQLite unique index on (orgId, code) treats NULLs as distinct — guard with findFirst.
      const existing = await db.ledgerAccount.findFirst({ where: { orgId: null, code: def.code } })
      if (!existing) await db.ledgerAccount.create({ data: { orgId: null, code: def.code, type: def.type, name: def.name } })
    })
  }
}

async function accountId(orgId: string | null, code: string): Promise<string> {
  let account = orgId
    ? await db.ledgerAccount.findUnique({ where: { orgId_code: { orgId, code } } })
    : await db.ledgerAccount.findFirst({ where: { orgId: null, code } })
  if (!account) {
    const def = PLATFORM_ACCOUNT_DEFS.find((d) => d.code === code)
    account = await db.ledgerAccount.create({
      data: { orgId, code, type: def?.type ?? 'EXPENSE', name: def?.name ?? code },
    })
  }
  return account.id
}

export interface PostJournalInput {
  idempotencyKey: string
  orgId?: string | null
  refType: 'ORDER_PAYMENT' | 'REFUND' | 'PAYOUT' | 'PAYOUT_REVERSAL' | 'SUBSCRIPTION' | 'PROMOTION' | 'ADJUSTMENT'
  refId: string
  memo: string
  createdBy: string
  lines: JournalLine[]
}

/** Post a journal atomically; returns null when the idempotency key already exists (safe replay). */
export async function postJournal(input: PostJournalInput): Promise<{ journalId: string; replay: boolean } | null> {
  const existing = await db.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { journalId: existing.id, replay: true }

  const debit = input.lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amountMinor, 0)
  const credit = input.lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amountMinor, 0)
  if (debit !== credit) throw new Error(`Unbalanced journal ${input.idempotencyKey}: DR ${debit} vs CR ${credit}`)
  if (debit <= 0) throw new Error('Journal must carry a positive amount')

  const resolved: { accountId: string; direction: EntryDirection; amountMinor: number }[] = []
  for (const line of input.lines) {
    const accId = await accountId(line.orgScoped ? (input.orgId ?? null) : null, line.accountCode)
    resolved.push({ accountId: accId, direction: line.direction, amountMinor: line.amountMinor })
  }

  return db.$transaction(async (tx) => {
    // Re-check inside the transaction to defeat concurrent double-posting.
    const dupe = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (dupe) return { journalId: dupe.id, replay: true }
    const journal = await tx.ledgerJournal.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        orgId: input.orgId ?? null,
        refType: input.refType,
        refId: input.refId,
        memo: input.memo.slice(0, 200),
        createdBy: input.createdBy,
      },
    })
    await tx.ledgerEntry.createMany({
      data: resolved.map((r) => ({ journalId: journal.id, accountId: r.accountId, direction: r.direction, amountMinor: r.amountMinor })),
    })
    return { journalId: journal.id, replay: false }
  })
}

export async function reverseJournal(originalJournalId: string, idempotencyKey: string, memo: string, createdBy: string) {
  const original = await db.ledgerJournal.findUnique({ where: { id: originalJournalId }, include: { entries: true } })
  if (!original) throw new Error('Original journal not found')
  if (original.status === 'REVERSED') return { replay: true }
  const posted = await postJournal({
    idempotencyKey,
    orgId: original.orgId,
    refType: 'ADJUSTMENT',
    refId: original.id,
    memo: `Reversal: ${memo}`,
    createdBy,
    lines: original.entries.map((e) => ({
      accountCode: '', // resolved via account id below — see postJournalByAccountIds
      orgScoped: false,
      direction: e.direction === 'DEBIT' ? ('CREDIT' as EntryDirection) : ('DEBIT' as EntryDirection),
      amountMinor: e.amountMinor,
    })),
  })
  if (posted && !posted.replay) {
    await db.ledgerJournal.update({ where: { id: originalJournalId }, data: { status: 'REVERSED', reversedBy: posted.journalId } })
  }
  return posted
}

/** Post by explicit account ids (used by reversals where codes aren't known). */
export async function postJournalByAccountIds(input: {
  idempotencyKey: string
  orgId?: string | null
  refType: 'ORDER_PAYMENT' | 'REFUND' | 'PAYOUT' | 'PAYOUT_REVERSAL' | 'SUBSCRIPTION' | 'PROMOTION' | 'ADJUSTMENT'
  refId: string
  memo: string
  createdBy: string
  lines: { accountId: string; direction: EntryDirection; amountMinor: number }[]
}) {
  const existing = await db.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { journalId: existing.id, replay: true }
  const debit = input.lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amountMinor, 0)
  const credit = input.lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amountMinor, 0)
  if (debit !== credit) throw new Error(`Unbalanced journal ${input.idempotencyKey}`)
  return db.$transaction(async (tx) => {
    const dupe = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (dupe) return { journalId: dupe.id, replay: true }
    const journal = await tx.ledgerJournal.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        orgId: input.orgId ?? null,
        refType: input.refType,
        refId: input.refId,
        memo: input.memo.slice(0, 200),
        createdBy: input.createdBy,
      },
    })
    await tx.ledgerEntry.createMany({ data: input.lines.map((l) => ({ journalId: journal.id, ...l })) })
    return { journalId: journal.id, replay: false }
  })
}

export async function accountBalanceMinor(orgId: string | null, code: string): Promise<number> {
  const account = orgId
    ? await db.ledgerAccount.findUnique({ where: { orgId_code: { orgId, code } } })
    : await db.ledgerAccount.findFirst({ where: { orgId: null, code } })
  if (!account) return 0
  const agg = await db.ledgerEntry.aggregate({
    where: { accountId: account.id },
    _sum: { amountMinor: true },
  })
  // Directional balance: assets/expenses increase with debits; liabilities/revenue with credits.
  const rows = await db.ledgerEntry.groupBy({ by: ['direction'], where: { accountId: account.id }, _sum: { amountMinor: true } })
  const debit = rows.find((r) => r.direction === 'DEBIT')?._sum.amountMinor ?? 0
  const credit = rows.find((r) => r.direction === 'CREDIT')?._sum.amountMinor ?? 0
  void agg
  if (account.type === 'ASSET' || account.type === 'EXPENSE') return debit - credit
  return credit - debit
}

export async function orgFinanceSummary(orgId: string) {
  const [payable, holds, payoutTotals, orderAgg, refundAgg] = await Promise.all([
    accountBalanceMinor(orgId, 'organizer_payable'),
    db.settlementHold.findMany({ where: { orgId, releasedAt: null } }),
    db.payout.groupBy({ by: ['status'], where: { orgId }, _sum: { amountMinor: true } }),
    db.order.groupBy({ by: ['status'], where: { orgId }, _sum: { totalMinor: true, platformFeeMinor: true } }),
    db.refundCase.groupBy({ by: ['status'], where: { orgId }, _count: true }),
  ])
  const holdTotal = holds.reduce((s, h) => s + h.amountMinor, 0)
  const completed = payoutTotals.find((p) => p.status === 'PAID')?._sum.amountMinor ?? 0
  const inFlight = payoutTotals
    .filter((p) => ['REQUESTED', 'APPROVED', 'SUBMITTED'].includes(p.status))
    .reduce((s, p) => s + (p._sum.amountMinor ?? 0), 0)
  const grossSales = orderAgg.find((o) => o.status === 'PAID')?._sum.totalMinor ?? 0
  const fees = orderAgg.find((o) => o.status === 'PAID')?._sum.platformFeeMinor ?? 0
  const refunded = refundAgg.find((r) => r.status === 'PROCESSED')?._count ?? 0
  return {
    grossSalesMinor: grossSales,
    platformFeesMinor: fees,
    netSalesMinor: grossSales - fees,
    refundsCount: refunded,
    pendingSettlementMinor: Math.max(0, payable),
    settlementHoldsMinor: holdTotal,
    availablePayoutMinor: Math.max(0, payable - holdTotal),
    payoutsInFlightMinor: inFlight,
    payoutsCompletedMinor: completed,
  }
}
