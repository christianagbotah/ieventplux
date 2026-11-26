/**
 * Synthetic identity concurrency checks. No provider requests or charges.
 * Restricted to the disposable CI PostgreSQL database.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { paymentIntentSnapshot } from '../src/server/platform-payment-intent'
import { bindSandboxTransaction } from '../src/server/services/sandbox-transaction-binding'

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid')
if (process.env.CI !== 'true' || process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5432' || url.pathname !== '/ieventplux') {
  throw new Error('Sandbox identity test requires disposable CI DB')
}
const key = randomUUID()
const intentIds: string[] = []
const attemptIds: string[] = []
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label)
  console.log('PASS ' + label)
}
async function createAttempt(n: number) {
  const snapshot = paymentIntentSnapshot({
    purpose: 'SUBSCRIPTION', sourceId: 'ci-' + key + '-' + n,
    reference: 'TEST-CI-' + key + '-' + n, currency: 'GHS',
    totalMinor: 100, pricingVersion: 'ci-identity-v1',
  })
  const intent = await db.platformPaymentIntent.create({ data: snapshot })
  intentIds.push(intent.id)
  const attempt = await db.platformSandboxAttempt.create({ data: {
    intentId: intent.id, reference: intent.reference, expectedAmountMinor: 100, currency: 'GHS',
  } })
  attemptIds.push(attempt.id)
  return attempt.id
}
const bind = (id: string, provider: string, notice = false) => db.$transaction(tx => bindSandboxTransaction(tx, id, provider, notice))
async function rejects(p: Promise<unknown>) {
  try { await p; return false } catch { return true }
}
try {
  const a = await createAttempt(1)
  const b = await createAttempt(2)
  const c = await createAttempt(3)
  const d = await createAttempt(4)
  const base = BigInt('9' + Date.now().toString()) * BigInt(100)
  const shared = String(base + BigInt(1))
  const race = await Promise.allSettled([bind(a, shared, true), bind(b, shared)])
  check(race.filter(r => r.status === 'fulfilled').length === 1, 'competing notification and verification claims have one winner')
  const winner = (race[0].status === 'fulfilled') ? a : b
  const loser = winner === a ? b : a
  check((await db.platformSandboxAttempt.findUniqueOrThrow({ where: { id: winner } })).providerTransactionId === shared, 'winner durably claims provider identity')
  check((await db.platformSandboxAttempt.findUniqueOrThrow({ where: { id: loser } })).providerTransactionId === null, 'loser leaves no identity change')
  await bind(winner, shared, true)
  await bind(winner, shared)
  check((await db.platformSandboxAttempt.findUniqueOrThrow({ where: { id: winner } })).status === 'NOTIFICATION_RECEIVED', 'same identity replay is safe and does not downgrade notification')
  check(await rejects(bind(winner, String(base + BigInt(2)))), 'same attempt rejects different transaction identity')
  check(await rejects(bind(loser, shared)), 'different attempt rejects already claimed transaction')
  // Legacy evidence may have been saved before the shared attempt binding existed.
  const oldId = String(base + BigInt(3))
  await db.platformSandboxCollectionEvidence.create({ data: {
    attemptId: c, providerTransactionId: oldId, amountMinor: 100, currency: 'GHS',
    recipientCode: null, allocation: 'PLATFORM_DIRECT',
  } })
  check(await rejects(bind(d, oldId, true)), 'legacy evidence cannot be claimed by another attempt')
  await bind(c, oldId)
  check((await db.platformSandboxAttempt.findUniqueOrThrow({ where: { id: c } })).providerTransactionId === oldId, 'legacy evidence owner can bind its original identity')
  check(await rejects(bind(d, 'invalid')), 'invalid provider identity rejected')
  console.log('SANDBOX_TRANSACTION_BINDING_SMOKE_PASS')
} finally {
  await db.platformSandboxNotification.deleteMany({ where: { attemptId: { in: attemptIds } } })
  await db.platformSandboxCollectionEvidence.deleteMany({ where: { attemptId: { in: attemptIds } } })
  await db.platformSandboxAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  await db.platformPaymentIntent.deleteMany({ where: { id: { in: intentIds } } })
  await db.$disconnect()
}
