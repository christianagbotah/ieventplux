/** Authenticated event operations reporting UAT. Strictly isolated PostgreSQL
 * schema and localhost-only endpoint. Synthetic users and historical QA orders. */
import { strict as assert } from 'node:assert'
import { db } from '../src/lib/db'
import { createSession, SESSION_COOKIE } from '../src/server/auth'

assert.equal(new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid').searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'Refusing any non-QA database!')
const base = 'http://127.0.0.1:3179'
async function main() {
  const event = await db.event.findFirst({
    where: { slug: { startsWith: 'merch-qa-event-' }, orders: { some: { status: 'PAID', souvenirItems: { some: {} } } } },
    orderBy: { createdAt: 'desc' }, select: { id: true, orgId: true },
  })
  assert.ok(event, 'Requires prior isolated merchandise QA receipts')
  const tag = Date.now().toString(36)
  const make = (role: string) => db.user.create({ data: { email: `qa-report-${role}-${tag}@example.invalid`,
    displayName: `Synthetic QA ${role}`, passwordHash: 'UNUSABLE-LOGIN' } })
  const [manager, finance, staff, outsider] = await Promise.all([make('eventmanager'),make('finance'),make('checkinstaff'),make('outsider')])
  await db.membership.createMany({ data: [
    { orgId: event.orgId, userId: manager.id, role: 'EVENT_MANAGER', acceptedAt: new Date() },
    { orgId: event.orgId, userId: finance.id, role: 'FINANCE', acceptedAt: new Date() },
    { orgId: event.orgId, userId: staff.id, role: 'CHECKIN_STAFF', acceptedAt: new Date() },
  ] })
  const [managerToken, financeToken, staffToken, outsiderToken] = await Promise.all([
    createSession(manager.id),createSession(finance.id),createSession(staff.id),createSession(outsider.id),
  ])
  const prefix = `${base}/api/v1/orgs/${event.orgId}/merchandise`
  const query = `?eventId=${encodeURIComponent(event.id)}`
  const get = (token: string | undefined, suffix = query) => fetch(prefix + suffix, {
    headers: token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}, signal: AbortSignal.timeout(15_000),
  })
  const status = async (label: string, promise: Promise<Response>, expected: number) => {
    const res = await promise
    assert.equal(res.status, expected, `${label} should be HTTP ${expected} not ${res.status}`)
    console.log(`PASS: ${label} (${res.status})`)
    return res
  }
  await status('anonymous report denied',get(undefined),401)
  await status('user outside organization denied',get(outsiderToken.token),403)
  await status('check-in staff without financial/reporting permission denied',get(staffToken.token),403)
  await status('event outside organization cannot be requested',get(managerToken.token,'?eventId=not-an-org-event'),404)
  await status('CSV needs an explicit event selection',get(managerToken.token,'?format=csv'),400)
  const opsResponse = await status('event manager can view operational counts',get(managerToken.token),200)
  assert.equal(opsResponse.headers.get('cache-control'),'private, no-store')
  const ops = await opsResponse.json() as { totals: { paidOrders: number; paidQty: number; salesMinor: number | null }; items: { salesMinor: number | null }[] }
  assert.ok(ops.totals.paidOrders > 0 && ops.totals.paidQty > 0)
  assert.equal(ops.totals.salesMinor,null)
  assert.ok(ops.items.every((item)=>item.salesMinor===null))
  console.log('PASS: event manager response has no merchandise monetary figures')
  const finResponse = await status('finance role can view genuine paid value',get(financeToken.token),200)
  const fin = await finResponse.json() as { totals: { salesMinor: number | null } }
  assert.ok(fin.totals.salesMinor!==null && fin.totals.salesMinor>0)
  const opsCsv = await status('event manager export is authorized with redaction',get(managerToken.token,`${query}&format=csv`),200)
  assert.equal(opsCsv.headers.get('content-type')?.startsWith('text/csv'),true)
  assert.equal(opsCsv.headers.get('cache-control'),'private, no-store')
  assert.ok(!(await opsCsv.text()).includes('Paid merchandise sales'))
  const finCsv = await status('finance export contains monetary column',get(financeToken.token,`${query}&format=csv`),200)
  assert.ok((await finCsv.text()).includes('Paid merchandise sales'))
  console.log('AUTHENTICATED MERCHANDISE REPORT ROUTE QA — ALL ASSERTIONS PASSED (ISOLATED DATA)')
}
main().catch((e) => { console.error('REPORT ROUTE QA FAILED:',e instanceof Error ? e.message : 'unknown');process.exitCode=1 })
  .finally(async()=>{await db.$disconnect()})
