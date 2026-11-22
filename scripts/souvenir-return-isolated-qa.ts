/** Actual authenticated return-intake API and review acceptance, only in
 * isolated ieventplux_merch_qa_20261119. Never triggers a real payment,
 * real refund, stock reversal, ticket admission or communication. */
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { requireIsolatedMerchandiseQaDatabase } from './merchandise-qa-db-guard'
import { db } from '../src/lib/db'
import { createSession, SESSION_COOKIE } from '../src/server/auth'

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid')
assert.equal(url.searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'REFUSING NON-QA DATABASE')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED, '1')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED, '1')
const base = 'http://127.0.0.1:3179'
async function main() {
  await requireIsolatedMerchandiseQaDatabase()
  const item = await db.souvenirOrderItem.findFirst({
    where: { collectedQty: { gte: 2 }, holdStatus: 'CONSUMED', order: { status: 'PAID', event: { slug: { startsWith: 'merch-qa-event-' } } }, returnIntakes: { none: {} } },
    select: { id: true, collectedQty: true, productId: true, order: { select: { id: true, orgId: true, eventId: true, status: true } } },
  })
  assert.ok(item, 'Need unreturned, synthetic fully collected order line from merchandise-isolated-qa.ts')
  const tag = Date.now().toString(36)
  const create = (kind: string) => db.user.create({ data: { email: `qa-returns-${kind}-${tag}@example.invalid`, displayName: `Synthetic ${kind}`, passwordHash: 'UNUSABLE-SYNTHETIC' } })
  const [receiver, finance, analyst, outsider] = await Promise.all([create('receiver'), create('finance'), create('analyst'), create('outsider')])
  await db.membership.createMany({ data: [
    { orgId: item.order.orgId, userId: receiver.id, role: 'ADMIN', acceptedAt: new Date() },
    { orgId: item.order.orgId, userId: finance.id, role: 'FINANCE', acceptedAt: new Date() },
    { orgId: item.order.orgId, userId: analyst.id, role: 'ANALYST', acceptedAt: new Date() },
  ] })
  const cookies = await Promise.all([receiver,finance,analyst,outsider].map(async (user) => (await createSession(user.id)).token))
  const before = {
    product: await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: item.productId } }),
    line: await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: item.id } }),
    tickets: await db.ticket.count({ where: { orderId: item.order.id } }),
    refunds: await db.refundCase.count({ where: { orderId: item.order.id } }),
    journal: await db.ledgerJournal.count({ where: { refId: item.order.id } }),
  }
  const post = (path: string, payload: object, i?: number) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(i === undefined ? {} : { Cookie: `${SESSION_COOKIE}=${cookies[i]}` }) },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
  })
  const expectStatus = async (label: string, request: Promise<Response>, expected: number) => {
    const response = await request
    assert.equal(response.status, expected, `${label}: HTTP ${response.status}, expected ${expected}`)
    console.log(`PASS: ${label} (${expected})`)
    return response
  }
  const originalId = randomUUID()
  const payload = { orderItemId: item.id, qty: 1, clientActionId: originalId, condition: 'SEALED', reason: 'Synthetic customer exchanged unwanted shirt', evidenceNote: 'Synthetic item physically examined at QA returns counter' }
  await expectStatus('anonymous return intake denied', post('/api/v1/souvenir-returns', payload), 401)
  await expectStatus('unrelated staff denied', post('/api/v1/souvenir-returns', payload,3),403)
  await expectStatus('analyst without physical collection role denied', post('/api/v1/souvenir-returns', payload,2),403)
  await expectStatus('invalid physical condition denied', post('/api/v1/souvenir-returns',{...payload,condition:'RESTOCKED'},0),400)
  const result = await expectStatus('accepted staff records physically received item', post('/api/v1/souvenir-returns',payload,0),200)
  const received = await result.json() as { id: string; status: string }
  assert.equal(received.status,'RECEIVED')
  const replay = await expectStatus('same-device retry idempotent',post('/api/v1/souvenir-returns',payload,0),200)
  assert.equal((await replay.json() as { status: string }).status,'ALREADY_RECORDED')
  await expectStatus('reused action ID with different quantity denied',post('/api/v1/souvenir-returns',{...payload,qty:2},0),409)
  const reviews = (id: string) => `/api/v1/souvenir-returns/${id}/review`
  await expectStatus('receiving user cannot approve own return',post(reviews(received.id),{decision:'ACCEPTED',note:'Inspection complete by same receiver'},0),403)
  await expectStatus('analyst cannot review physical returns',post(reviews(received.id),{decision:'ACCEPTED',note:'Improper analyst return approval'},2),403)
  const accepted = await expectStatus('independent finance staff verifies physical custody',post(reviews(received.id),{decision:'ACCEPTED',note:'Synthetic sealed item physically inspected'},1),200)
  assert.equal((await accepted.json() as { status: string }).status,'ACCEPTED')
  await expectStatus('second review cannot overwrite accepted evidence',post(reviews(received.id),{decision:'REJECTED',note:'Attempted conflicting review update'},1),409)
  const second = await expectStatus('second received unit recorded', post('/api/v1/souvenir-returns',{...payload,clientActionId:randomUUID(),condition:'OPENED'},0),200)
  const secondRecord = await second.json() as { id: string }
  await expectStatus('third unit overreturned while second receipt pending',post('/api/v1/souvenir-returns',{...payload,clientActionId:randomUUID()},0),409)
  await expectStatus('finance rejects unverified second return',post(reviews(secondRecord.id),{decision:'REJECTED',note:'Synthetic test could not verify custody'},1),200)
  const replacement = await expectStatus('rejected evidence releases return intake capacity',post('/api/v1/souvenir-returns',{...payload,clientActionId:randomUUID(),condition:'DAMAGED'},0),200)
  const replacementRecord = await replacement.json() as { id: string }
  await expectStatus('finance verifies damaged item custody without restocking',post(reviews(replacementRecord.id),{decision:'ACCEPTED',note:'Synthetic damaged goods received for finance review'},1),200)
  await expectStatus('cannot exceed total previously handed-over units',post('/api/v1/souvenir-returns',{...payload,clientActionId:randomUUID()},0),409)
  const get = (i:number) => fetch(`${base}/api/v1/souvenir-returns?eventId=${encodeURIComponent(item.order.eventId)}`, { headers: { Cookie: `${SESSION_COOKIE}=${cookies[i]}` },signal:AbortSignal.timeout(15_000) })
  await expectStatus('analyst cannot access physical return records',get(2),403)
  const listing = await expectStatus('authorized finance user sees immutable audit trail',get(1),200)
  assert.equal(listing.headers.get('cache-control'),'private, no-store')
  const listed = await listing.json() as { items: { id: string; status: string }[] }
  assert.ok(listed.items.some((row)=>row.id===received.id && row.status==='ACCEPTED'))
  assert.ok(listed.items.some((row)=>row.id===secondRecord.id && row.status==='REJECTED'))
  assert.equal(await db.souvenirReturnIntake.count({ where: { orderItemId: item.id } }), 3)
  const afterProduct = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: item.productId } })
  assert.equal(afterProduct.stockSold,before.product.stockSold)
  assert.equal(afterProduct.stockFulfilled,before.product.stockFulfilled)
  assert.equal(afterProduct.stockReserved,before.product.stockReserved)
  assert.equal((await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: item.id } })).collectedQty,before.line.collectedQty)
  assert.equal(await db.ticket.count({ where: { orderId: item.order.id } }),before.tickets)
  assert.equal(await db.refundCase.count({ where: { orderId: item.order.id } }),before.refunds)
  assert.equal(await db.ledgerJournal.count({ where: { refId: item.order.id } }),before.journal)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: item.order.id } })).status,item.order.status)
  console.log('PASS: return intake/review changed NO stock, entitlement, ledger, refund case or order payment status')
  console.log('PHYSICAL SOUVENIR RETURN INTAKE / FINANCE REVIEW HTTP QA — ALL ASSERTIONS PASSED, ISOLATED SYNTHETIC DATA')
}
main().catch((error) => { console.error('RETURN INTAKE QA FAILED:',error instanceof Error ? error.message : String(error));process.exitCode=1 }).finally(async()=>{await db.$disconnect()})
