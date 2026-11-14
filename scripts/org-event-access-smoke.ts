/**
 * Round 38 regression: a private organizer listing may not reveal other
 * organizations' unpublished/invitation-only event records. DEV SEED ONLY.
 * No mutations or financial provider calls.
 */
import { db } from '../src/lib/db'

if (process.env.NODE_ENV === 'production') throw new Error('Development seed smoke must never run in production.')
const base = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')
const seededPassword = 'Dev@12345'
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
  console.log('PASS ' + message)
}

async function auth(email: string): Promise<string> {
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: seededPassword }),
  })
  assert(res.ok, 'seeded login for ' + email)
  const setCookie = res.headers.getSetCookie?.()[0] ?? res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  assert(cookie.startsWith('ievx_session='), 'signed-in session cookie issued')
  return cookie
}

async function list(cookie: string | undefined, search: string): Promise<{ status: number; data: any }> {
  const res = await fetch(base + '/events?' + search, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: res.status, data: await res.json() }
}

async function main() {
  const chapel = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-chapel' } })
  const ministries = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-ministries' } })
  const publicOrg = await db.organization.findUniqueOrThrow({ where: { slug: 'ghana-tech-association' } })
  const anonymous = await list(undefined, 'mine=1')
  assert(anonymous.status === 401, 'private event inventory rejects anonymous caller')

  const attendee = await auth('ama@example.dev')
  const attendeeMine = await list(attendee, 'mine=1')
  assert(attendeeMine.status === 200 && attendeeMine.data.total === 0 && attendeeMine.data.items.length === 0, 'attendee cannot enumerate any organizer events')
  assert((await list(attendee, 'mine=1&orgId=' + chapel.id)).status === 403, 'attendee denied when guessing organization id')

  const pastor = await auth('pastor@lightworld.dev')
  const own = await list(pastor, 'mine=1&orgId=' + chapel.id + '&pageSize=50')
  assert(own.status === 200 && own.data.total > 0, 'organizer accesses own organization')
  assert(own.data.items.every((item: any) => item.org.id === chapel.id), 'requested org listing is tenant scoped')
  const allOwn = await list(pastor, 'mine=1&pageSize=50')
  assert(allOwn.status === 200 && allOwn.data.items.every((item: any) => item.org.id === chapel.id), 'unfiltered mine listing excludes unrelated organizations')
  assert((await list(pastor, 'mine=1&orgId=' + ministries.id)).status === 403, 'organizer cannot enumerate another organization')
  assert((await list(pastor, 'mine=1&orgId=' + publicOrg.id)).status === 403, 'organizer cannot access unrelated published inventory privately')

  const multiOrg = await auth('media@lightworld.dev')
  const combined = await list(multiOrg, 'mine=1&pageSize=50')
  assert(combined.status === 200 && combined.data.items.length > 0, 'multi-org member can list joined events')
  assert(combined.data.items.every((item: any) => [chapel.id, ministries.id].includes(item.org.id)), 'multi-org results limited to accepted memberships')
  const globalAdmin = await auth('admin@ieventplux.dev')
  const staffMine = await list(globalAdmin, 'mine=1')
  assert(staffMine.status === 200 && staffMine.data.items.length === 0, 'platform admin cannot bypass member tenant access')
}

main().catch((err) => {
  console.error('ORG EVENT PRIVACY SMOKE FAILED:', err)
  process.exitCode = 1
}).finally(() => db.$disconnect())
