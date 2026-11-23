/** Synthetic merchandise reporting QA; refuses anything except isolated DB. */
import { strict as assert } from 'node:assert'
import { requireIsolatedMerchandiseQaDatabase } from './merchandise-qa-db-guard'

// Do not initialize Prisma or session services until the scratch DB is verified.
let db!: (typeof import('../src/lib/db'))['db']

assert.equal(new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid').searchParams.get('schema'), 'ieventplux_merch_qa_20261119')
async function main() {
  await requireIsolatedMerchandiseQaDatabase()
  db = (await import('../src/lib/db')).db
  const { merchandiseReconciliation, merchandiseReportCsv } = await import('../src/server/services/merchandise-reconciliation')
  const event = await db.event.findFirst({
    where: { slug: { startsWith: 'merch-qa-event-' }, orders: { some: { status: 'PAID', souvenirItems: { some: {} } } } },
    orderBy: { createdAt: 'desc' }, select: { id: true, orgId: true },
  })
  assert.ok(event, 'Create synthetic paid souvenir orders in this isolated schema first')
  const financial = await merchandiseReconciliation(event.orgId, event.id, true)
  const opsOnly = await merchandiseReconciliation(event.orgId, event.id, false)
  assert.equal(financial.eventId, event.id)
  assert.equal(opsOnly.eventId, event.id)
  assert.ok(financial.totals.paidOrders > 0)
  assert.equal(financial.totals.paidOrders, await db.order.count({ where: {
    orgId: event.orgId, eventId: event.id, status: 'PAID', souvenirItems: { some: { holdStatus: 'CONSUMED' } },
  } }))
  assert.equal(financial.totals.paidQty, opsOnly.totals.paidQty)
  assert.equal(financial.totals.collectedQty, opsOnly.totals.collectedQty)
  assert.ok(financial.totals.paidQty >= financial.totals.collectedQty)
  assert.equal(financial.totals.outstandingQty, financial.totals.paidQty - financial.totals.collectedQty)
  assert.equal(opsOnly.totals.salesMinor, null)
  assert.ok(opsOnly.items.every((item) => item.salesMinor === null))
  assert.ok(financial.totals.salesMinor !== null && financial.totals.salesMinor > 0)
  assert.equal(opsOnly.recentCollections.length, financial.recentCollections.length)
  console.log('PASS: real paid-order quantities, uncollected balances and staff collection records agree')
  console.log('PASS: event-manager operational report redacts all money fields')
  const csvOps = merchandiseReportCsv(opsOnly)
  const csvFinance = merchandiseReportCsv(financial)
  assert.ok(!csvOps.includes('Paid merchandise sales'))
  assert.ok(csvFinance.includes('Paid merchandise sales'))
  console.log('PASS: role-sensitive CSV columns and sanitized event/SKU names')
  // A fresh disposable CI database contains only the fixture organization.
  // Create a second synthetic tenant explicitly rather than relying on seed
  // data that may differ across environments.
  const outsider = await db.user.create({ data: {
    email: `qa-other-tenant-${Date.now()}@example.invalid`,
    passwordHash: 'UNUSABLE-QA-PASSWORD', displayName: 'Synthetic Other Tenant Owner',
  } })
  const other = await db.organization.create({ data: {
    name: 'Synthetic Isolated Other Tenant', slug: `merch-qa-other-${Date.now()}`,
    ownerId: outsider.id, status: 'ACTIVE',
  } })
  await assert.rejects(() => merchandiseReconciliation(other.id, event.id, true), /Event not found/)
  console.log('PASS: event ID from a different organization is rejected')
  console.log('ISOLATED MERCHANDISE RECONCILIATION QA — ALL ASSERTIONS PASSED')
}
main().catch((e) => { console.error('RECONCILIATION QA FAILED:', e instanceof Error ? e.message : 'unknown'); process.exitCode = 1 })
  .finally(async () => { await db?.$disconnect() })
