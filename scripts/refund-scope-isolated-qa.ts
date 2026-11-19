/** Strict cross-organization refund HTTP authorization QA.
 * Only synthetic *.invalid accounts and orders in an explicitly named isolated
 * PostgreSQL schema. No real provider refunds, real users or ledger reversals. */
import { strict as assert } from 'node:assert'
import { db } from '../src/lib/db'
import { createSession, SESSION_COOKIE } from '../src/server/auth'

assert.equal(new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid').searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'Refusing to test against production data')
const base = 'http://127.0.0.1:3179'
const tag = Date.now().toString(36)
async function main() {
  const grouped = await db.order.groupBy({ by: ['orgId'], where: { status: 'PAID', event: { slug: { startsWith: 'merch-qa-event-' } } }, _count: { id: true } })
  assert.ok(grouped.length >= 2, 'Run synthetic merchandise-order QA first')
  const [orgA, orgB] = grouped
  assert.notEqual(orgA.orgId, orgB.orgId)
  const [eventA, eventB] = await Promise.all([
    db.event.findFirstOrThrow({ where: { orgId: orgA.orgId, slug: { startsWith: 'merch-qa-event-' } }, select: { id: true } }),
    db.event.findFirstOrThrow({ where: { orgId: orgB.orgId, slug: { startsWith: 'merch-qa-event-' } }, select: { id: true } }),
  ])
  // New synthetic orders ensure the test cannot disturb any preexisting QA
  // receipt, refund case or previously checked-in/collected entitlement.
  const own = await db.order.create({ data: {
    orgId: orgA.orgId, eventId: eventA.id, reference: `ORD-OWNQA${tag.toUpperCase()}`,
    buyerName: 'Synthetic Own Buyer', buyerEmail: `qa-own-${tag}@example.invalid`,
    subtotalMinor: 1500, totalMinor: 1500, status: 'PAID',
  } })
  const foreign = await db.order.create({ data: {
    orgId: orgB.orgId, eventId: eventB.id, reference: `ORD-FORQA${tag.toUpperCase()}`,
    buyerName: 'Synthetic Foreign Buyer', buyerEmail: `qa-foreign-${tag}@example.invalid`,
    subtotalMinor: 1500, totalMinor: 1500, status: 'PAID',
  } })
  const staff = await db.user.create({ data: { displayName: 'Synthetic Finance Staff', email: `qa-refund-scope-${tag}@example.invalid`, passwordHash: 'NO-REAL-LOGIN' } })
  await db.membership.create({ data: { orgId: orgA.orgId, userId: staff.id, role: 'FINANCE', acceptedAt: new Date() } })
  const session = await createSession(staff.id)
  const headers = { Cookie: `${SESSION_COOKIE}=${session.token}`, 'Content-Type': 'application/json' }
  const post = (action: string, body: unknown, orgId = orgA.orgId) => fetch(`${base}/api/v1/orgs/${orgId}/${action}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  })
  const old = await db.refundCase.count({ where: { orderId: foreign.id } })
  const foreignAttempt = await post('refund-request', { orderId: foreign.id, reason: 'Synthetic unauthorized cross org case' })
  assert.equal(foreignAttempt.status, 404, `Cross-org request should be invisible/not-found, received ${foreignAttempt.status}`)
  assert.equal(await db.refundCase.count({ where: { orderId: foreign.id } }), old)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: foreign.id } })).status, foreign.status)
  console.log('PASS: Finance member of org A cannot open a refund or change order in org B (404; no write)')
  const invalidScope = await post('refund-request', { orderId: own.id, reason: 'Synthetic unauthorized scope' }, orgB.orgId)
  assert.equal(invalidScope.status, 403)
  console.log('PASS: URL org B cannot be used to borrow refund permission (403)')

  const ownRequest = await post('refund-request', { orderId: own.id, reason: 'Synthetic correct organization refund review' })
  assert.equal(ownRequest.status, 200)
  const created = await ownRequest.json() as { refundCase: { id: string; orderId: string; status: string } }
  assert.equal(created.refundCase.orderId, own.id)
  assert.equal(created.refundCase.status, 'REQUESTED')
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: own.id } })).status, 'REFUND_PENDING')
  console.log('PASS: Authorized same-organization finance user can initiate a review only for their own org')
  const rejection = await post('refund-reject', { caseId: created.refundCase.id, note: 'Synthetic test declines refund, no payment performed' })
  assert.equal(rejection.status, 200)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: own.id } })).status, 'PAID')
  console.log('PASS: Rejection of ordinary paid-order review restores PAID, without touching payment provider')

  const event = await db.event.findFirstOrThrow({ where: { orgId: orgA.orgId }, select: { id: true } })
  const exception = await db.order.create({ data: {
    orgId: orgA.orgId, eventId: event.id, reference: `ORD-EXQA${tag.toUpperCase()}`,
    buyerName: 'Synthetic Buyer', buyerEmail: `qa-exception-${tag}@example.invalid`,
    subtotalMinor: 1000, totalMinor: 1000, status: 'REFUND_PENDING',
    exceptionReason: 'Synthetic late provider success without valid inventory',
  } })
  const request = await db.refundCase.create({ data: {
    orderId: exception.id, requestedBy: staff.id, reason: 'Synthetic exception review',
    amountMinor: 1000, status: 'REQUESTED', type: 'FULL',
  } })
  const declineException = await post('refund-reject', { caseId: request.id, note: 'Synthetic exception remains unfulfilled and requires finance review' })
  assert.equal(declineException.status, 200)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: exception.id } })).status, 'EXCEPTION_REVIEW')
  console.log('PASS: Rejected refund for an exception order cannot restore PAID / invent entitlements')
  console.log('REFUND ORGANIZATION SCOPE + EXCEPTION PRESERVATION HTTP QA PASSED — synthetic data only')
}
main().catch((error) => { console.error('REFUND SCOPE QA FAILED:', error instanceof Error ? error.message : String(error)); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
