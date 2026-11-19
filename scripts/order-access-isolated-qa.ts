/** Security acceptance tests against 127.0.0.1:3179 and isolated schema only.
 * Synthetic accounts/order and fake provider tokens; never real customer data.
 * No provider, email, payment, biometric or revenue actions occur here. */
import { strict as assert } from 'node:assert'
import { db } from '../src/lib/db'
import { createSession, SESSION_COOKIE } from '../src/server/auth'

const dbUrl = new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid')
assert.equal(dbUrl.searchParams.get('schema'),'ieventplux_merch_qa_20261119','Refusing non-QA DB!')
const base = 'http://127.0.0.1:3179'
const fakeSecret = `QA-PROVIDER-TOKEN-NEVER-EXPOSE-${Date.now()}`
async function main() {
  const event = await db.event.findFirst({ where: { slug: { startsWith: 'merch-qa-event-' } }, select: { id:true, orgId: true } })
  assert.ok(event)
  const uniq = Date.now().toString(36)
  const create = (name: string) => db.user.create({ data: {
    email: `qa-full-order-${name}-${uniq}@example.invalid`, displayName: `Synthetic ${name}`, passwordHash: 'UNUSABLE-LOGIN',
  } })
  const [buyer, outsider, pending, staff, analyst, manager] = await Promise.all([
    create('buyer'),create('outsider'),create('pending'),create('checkin'),create('analyst'),create('manager'),
  ])
  await db.membership.createMany({ data: [
    { orgId: event.orgId, userId: pending.id, role: 'ADMIN', acceptedAt: null },
    { orgId: event.orgId, userId: staff.id, role: 'CHECKIN_STAFF', acceptedAt: new Date() },
    { orgId: event.orgId, userId: analyst.id, role: 'ANALYST', acceptedAt: new Date() },
    { orgId: event.orgId, userId: manager.id, role: 'EVENT_MANAGER', acceptedAt: new Date() },
  ] })
  const reference = `ORD-QA${uniq.toUpperCase()}`
  const order = await db.order.create({ data: {
    eventId: event.id, orgId: event.orgId, userId: buyer.id,
    reference, buyerName:'Synthetic Private Buyer', buyerEmail:buyer.email,
    subtotalMinor: 4000, totalMinor: 4000, status:'PENDING_PAYMENT',
  } })
  const providerRef = `QA-TRX-${uniq.toUpperCase()}`
  await db.paymentAttempt.create({ data: {
    orderId: order.id, reference: providerRef, status:'PENDING', amountMinor: 4000, provider:'SIMULATOR',
    providerToken: fakeSecret, rawResult: JSON.stringify({ privateProviderToken: fakeSecret }),
  } })
  const sessions = await Promise.all([buyer,outsider,pending,staff,analyst,manager].map((u)=>createSession(u.id)))
  const tokenFor=(i:number)=>sessions[i].token
  const read = async (path:string, i?:number, method='GET') => fetch(`${base}/api/v1/orders/${reference}${path}`,{
    method,headers: i===undefined?{}:{ Cookie: `${SESSION_COOKIE}=${tokenFor(i)}` },signal:AbortSignal.timeout(20_000),
  })
  const must = async(label:string, path:string, index:number|undefined, expectStatus:number) => {
    const res=await read(path,index)
    assert.equal(res.status,expectStatus,`${label}: got ${res.status}, expected ${expectStatus}`)
    console.log(`PASS: ${label} (${res.status})`)
    return res
  }
  await must('anonymous order receipt denied before existence lookup','',undefined,401)
  await must('unrelated signed-in account denied','',1,403)
  await must('invited, not accepted admin denied','',2,403)
  await must('check-in staff cannot inspect buyer payment or ticket data','',3,403)
  await must('buyer suggestions inaccessible to outsider','/suggestions',1,403)
  await must('unaccepted admin cannot open related recommendations','/suggestions',2,403)
  await must('check-in staff cannot open order suggestions','/suggestions',3,403)
  const result=await must('original buyer may see their receipt','',0,200)
  assert.equal(result.headers.get('cache-control'),'private, no-store')
  const data=await result.json() as {order:{buyerEmail:string,payments:Record<string,unknown>[]}}
  assert.equal(data.order.buyerEmail,buyer.email)
  assert.equal(data.order.payments.length,1)
  assert.deepEqual(Object.keys(data.order.payments[0]).sort(),['attemptNo','id','provider','reference','status'].sort())
  assert.ok(!JSON.stringify(data).includes(fakeSecret),'Gateway secret must never reach the browser')
  console.log('PASS: no gateway token, private provider IDs or raw payment results in receipt response')
  await must('accepted analyst can view order reporting details','',4,200)
  await must('accepted event manager can view order reporting details','',5,200)
  const sug=await must('buyer recommendations work and are private','/suggestions',0,200)
  assert.equal(sug.headers.get('cache-control'),'private, no-store')
  console.log('PASS: permitted recommendations remain operational with private cache controls')
  const unauthorizedFree = await db.order.create({ data: {
    eventId:event.id,orgId:event.orgId,reference:`ORD-FREE-QA${uniq.toUpperCase()}`,
    buyerName:'Guest without a verified buyer account', buyerEmail:buyer.email,
    subtotalMinor:0,totalMinor:0,kind:'FREE',status:'DRAFT',userId:null,
  } })
  const freeUrl=`${base}/api/v1/orders/${unauthorizedFree.reference}`
  const response = await fetch(freeUrl,{method:'POST',headers:{Cookie:`${SESSION_COOKIE}=${tokenFor(1)}`},signal:AbortSignal.timeout(20_000)})
  assert.equal(response.status,403,'A reference alone cannot confirm unowned free RSVP')
  assert.equal((await db.order.findUniqueOrThrow({where:{id:unauthorizedFree.id}})).status,'DRAFT')
  console.log('PASS: null-owner free order cannot be confirmed by someone who knows its reference')
  console.log('FULL ORDER PRIVACY QA PASSED — isolated synthetic accounts, no real money/messages')
}
main().catch((error)=>{console.error('ORDER ACCESS QA FAILED:',error instanceof Error?error.message:'unknown');process.exitCode=1}).finally(async()=>{await db.$disconnect()})
