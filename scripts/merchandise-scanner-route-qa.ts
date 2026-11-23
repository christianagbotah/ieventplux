/** Synthetic QR/manual receipt lookup acceptance on localhost:3179. Cannot run
 * against live data. Never invokes payment, message delivery, stock mutations
 * or a physical handover. */
import { strict as assert } from 'node:assert'
import { requireIsolatedMerchandiseQaDatabase } from './merchandise-qa-db-guard'

// Do not initialize Prisma or session services until the scratch DB is verified.
let db!: (typeof import('../src/lib/db'))['db']
import { verifySouvenirCollectionToken } from '../src/server/souvenir-policy'

assert.equal(new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid').searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'Refusing anything but isolated QA database')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED, '1', 'QA must explicitly opt into souvenir lookup')
const url = 'http://127.0.0.1:3179/api/v1/souvenir-collection/lookup'
async function main() {
  await requireIsolatedMerchandiseQaDatabase()
  db = (await import('../src/lib/db')).db
  const { createSession, SESSION_COOKIE } = await import('../src/server/auth')
  const order = await db.order.findFirst({ where: { status: 'PAID', event: { slug: { startsWith: 'merch-qa-event-' } }, souvenirItems: { some: { holdStatus: 'CONSUMED' } } }, orderBy: { createdAt: 'desc' }, select: { reference: true, orgId: true } })
  assert.ok(order, 'Run merchandise-isolated-qa.ts in the isolated schema first')
  const tag = Date.now().toString(36)
  const make = (role: string) => db.user.create({ data: { email: `qa-manual-lookup-${role}-${tag}@example.invalid`, displayName: `Synthetic ${role}`, passwordHash: 'UNUSABLE-LOGIN' } })
  const [staff, pending, analyst, outsider] = await Promise.all([make('staff'), make('pending'), make('analyst'), make('outsider')])
  await db.membership.createMany({ data: [
    { orgId: order.orgId, userId: staff.id, role: 'CHECKIN_STAFF', acceptedAt: new Date() },
    { orgId: order.orgId, userId: pending.id, role: 'ADMIN' },
    { orgId: order.orgId, userId: analyst.id, role: 'ANALYST', acceptedAt: new Date() },
  ] })
  const cookies = await Promise.all([staff, pending, analyst, outsider].map(async (u) => (await createSession(u.id)).token))
  const post = async (reference: unknown, token?: string) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}) },
    body: JSON.stringify({ reference }), signal: AbortSignal.timeout(20_000),
  })
  const test = async (label: string, ref: unknown, token: string | undefined, expected: number) => {
    const result = await post(ref, token)
    assert.equal(result.status, expected, `${label}: HTTP ${result.status} instead of ${expected}`)
    console.log(`PASS: ${label} (${expected})`)
    return result
  }
  await test('anonymous lookup denied', order.reference, undefined, 401)
  await test('outsider denied', order.reference, cookies[3], 403)
  await test('pending admin invitation denied', order.reference, cookies[1], 403)
  await test('analyst without checkin:scan permission denied', order.reference, cookies[2], 403)
  await test('printed receipt malformed', '../../other', cookies[0], 400)
  await test('nonexistent receipt rejected', 'ORD-FAKERECEIPT', cookies[0], 404)
  const response = await test('accepted event staff resolves exact printed RCPT- receipt', `RCPT-${order.reference}`.toLowerCase(), cookies[0], 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json() as { token: string }
  assert.equal(verifySouvenirCollectionToken(body.token), order.reference)
  assert.ok(!JSON.stringify(body).includes('buyerName'))
  console.log('PASS: lookup issues only signed reference and discloses no buyer contact details')
  const auth = await fetch(`http://127.0.0.1:3179/api/v1/souvenir-collection/${body.token}`, {
    headers: { Cookie: `${SESSION_COOKIE}=${cookies[0]}` }, signal: AbortSignal.timeout(20_000),
  })
  assert.equal(auth.status, 200)
  const data = await auth.json() as { receipt: { reference: string; collectionEnabled: boolean } }
  assert.equal(data.receipt.reference, order.reference)
  assert.equal(data.receipt.collectionEnabled, true)
  console.log('PASS: signed reference opens the separate staff-authorized paid collection receipt')
  console.log('SOUVENIR CAMERA/REFERENCE LOOKUP HTTP QA: ALL ASSERTIONS PASSED — synthetic data only')
}
main().catch((error) => { console.error('SOUVENIR LOOKUP QA FAILED:', error instanceof Error ? error.message : String(error)); process.exitCode = 1 }).finally(async () => { await db?.$disconnect() })
