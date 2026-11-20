/**
 * Real HTTP access-control and QR handover UAT against local isolated staging.
 * Requires ?schema=ieventplux_merch_qa_20261119, explicit feature opt-in,
 * a paid synthetic receipt, and an app listening on 127.0.0.1:3179.
 * Never touches customer accounts, real payment providers or live orders.
 */
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { createSession, SESSION_COOKIE } from '../src/server/auth'
import { souvenirCollectionToken } from '../src/server/souvenir-policy'

const dbUrl = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid')
assert.equal(dbUrl.searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'Refusing non-QA database!')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED, '1')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED, '1')
const base = 'http://127.0.0.1:3179'

async function main() {
  const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(15_000) })
  assert.equal(response.status, 200, 'Staging API must be available on local-only port')
  const order = await db.order.findFirst({
    where: { status: 'PAID', event: { slug: { startsWith: 'merch-qa-event-' } },
      souvenirItems: { some: { holdStatus: 'CONSUMED', collectedQty: 0, qty: 1 } } },
    orderBy: { createdAt: 'desc' },
    include: { souvenirItems: true },
  })
  assert.ok(order, 'First run scripts/merchandise-isolated-qa.ts against the isolated QA schema')
  const item = order.souvenirItems.find((x) => x.holdStatus === 'CONSUMED' && x.qty === 1 && x.collectedQty === 0)
  assert.ok(item)
  const tag = Date.now().toString(36)
  const makeUser = (kind: string) => db.user.create({ data: {
    email: `qa-collection-${kind}-${tag}@example.invalid`, passwordHash: 'NOT-A-REAL-PASSWORD', displayName: `Synthetic QA ${kind}`,
  } })
  const staff = await makeUser('staff')
  const outsider = await makeUser('outsider')
  const unaccepted = await makeUser('pending')
  const analyst = await makeUser('analyst')
  await db.membership.createMany({ data: [
    { orgId: order.orgId, userId: staff.id, role: 'CHECKIN_STAFF', acceptedAt: new Date() },
    { orgId: order.orgId, userId: unaccepted.id, role: 'CHECKIN_STAFF' },
    { orgId: order.orgId, userId: analyst.id, role: 'ANALYST', acceptedAt: new Date() },
  ] })
  const [staffSession, outsiderSession, pendingSession, analystSession] = await Promise.all([
    createSession(staff.id), createSession(outsider.id), createSession(unaccepted.id), createSession(analyst.id),
  ])
  const token = souvenirCollectionToken(order.reference)
  assert.ok(!token.includes(order.buyerEmail), 'QR must not contain buyer identity')
  const url = `${base}/api/v1/souvenir-collection/${encodeURIComponent(token)}`
  const call = (method: string, cookie?: string, body?: object, target = url) => fetch(target, {
    method, headers: { ...(cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  })
  const requireStatus = async (label: string, request: Promise<Response>, expected: number) => {
    const res = await request
    assert.equal(res.status, expected, `${label}: expected ${expected}, received ${res.status}`)
    console.log(`PASS: ${label} (${res.status})`)
    return res
  }
  await requireStatus('anonymous QR lookup rejected', call('GET'), 401)
  await requireStatus('signed-in nonstaff denied', call('GET', outsiderSession.token), 403)
  await requireStatus('invited-but-unaccepted staff denied', call('GET', pendingSession.token), 403)
  await requireStatus('accepted analyst without scanner role denied', call('GET', analystSession.token), 403)
  await requireStatus('tampered QR token rejected', call('GET', staffSession.token, undefined, `${url}0`), 404)
  const staffGet = await requireStatus('accepted event check-in staff sees paid receipt', call('GET', staffSession.token), 200)
  assert.equal(staffGet.headers.get('cache-control'), 'private, no-store')
  const receipt = await staffGet.json() as { receipt: { collectionEnabled: boolean; collectionAllowed: boolean; items: { id: string; remaining: number }[] } }
  assert.equal(receipt.receipt.collectionEnabled, true)
  assert.equal(receipt.receipt.collectionAllowed, true)
  assert.ok(receipt.receipt.items.some((x) => x.id === item.id && x.remaining === 1))
  const actionId = randomUUID()
  const payload = { itemId: item.id, qty: 1, clientActionId: actionId, confirm: true }
  await requireStatus('nonstaff POST denied', call('POST', outsiderSession.token, payload), 403)
  await requireStatus('explicit physical handover confirmation required', call('POST', staffSession.token, { ...payload, confirm: false }), 400)
  const ticketsBefore = await db.ticket.count({ where: { orderId: order.id } })
  const productBefore = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: item.productId } })
  const collected = await requireStatus('authorized physical handover', call('POST', staffSession.token, payload), 200)
  assert.equal((await collected.json() as { status: string }).status, 'COLLECTED')
  const replay = await requireStatus('same-action mobile replay', call('POST', staffSession.token, payload), 200)
  assert.equal((await replay.json() as { status: string }).status, 'ALREADY_RECORDED')
  await requireStatus('second action cannot over-collect', call('POST', staffSession.token, { ...payload, clientActionId: randomUUID() }), 409)
  assert.equal((await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: item.id } })).collectedQty, 1)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: item.productId } })).stockFulfilled, productBefore.stockFulfilled + 1)
  assert.equal(await db.souvenirCollection.count({ where: { orderItemId: item.id } }), 1)
  assert.equal(await db.ticket.count({ where: { orderId: order.id } }), ticketsBefore)
  console.log('PASS: exact stock ledger and separate admission ticket state retained')
  console.log('AUTHENTICATED QR COLLECTION HTTP QA — ALL ASSERTIONS PASSED (ISOLATED SYNTHETIC DATA)')
}
main().catch((e) => { console.error('QA FAILED',e instanceof Error ? e.message : 'unknown'); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
