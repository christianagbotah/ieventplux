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

  // Unaccepted invitations must never grant access to drafts, attendee lists
  // or organizer navigation. Clean up the test-only invitation even on error.
  const ama = await db.user.findUniqueOrThrow({ where: { email: 'ama@example.dev' } })
  const pendingInvite = await db.membership.create({
    data: { userId: ama.id, orgId: ministries.id, role: 'EVENT_MANAGER', acceptedAt: null },
  })
  try {
    assert((await list(attendee, 'mine=1&orgId=' + ministries.id)).status === 403, 'pending invitation grants no private event access')
    const pendingMine = await list(attendee, 'mine=1')
    assert(pendingMine.status === 200 && pendingMine.data.total === 0, 'pending invitation excluded from own org list')
    const me = await fetch(base + '/auth/me', { headers: { Cookie: attendee } }).then((res) => res.json())
    assert(!(me.memberships ?? []).some((m: any) => m.orgId === ministries.id), 'unaccepted invitation excluded from authorized session memberships')
  } finally {
    await db.membership.delete({ where: { id: pendingInvite.id } })
  }

  const pastor = await auth('pastor@lightworld.dev')
  const own = await list(pastor, 'mine=1&orgId=' + chapel.id + '&pageSize=50')
  assert(own.status === 200 && own.data.total > 0, 'organizer accesses own organization')
  assert(own.data.items.every((item: any) => item.org.id === chapel.id), 'requested org listing is tenant scoped')
  // Targeted attendee deep links must never bypass the accepted-membership
  // organization boundary, even for an existing unlisted or older event.
  const firstOwnId = own.data.items[0].id as string
  const targeted = await list(pastor, 'mine=1&orgId=' + chapel.id + '&eventId=' + firstOwnId)
  assert(targeted.status === 200 && targeted.data.total === 1 && targeted.data.items[0]?.id === firstOwnId,
    'organizer may select a specific event through a tenant-scoped deep link')
  // Event admission monitoring must remain inside the same accepted
  // membership boundary and must never leak ticket credentials or holders.
  const anonymousMonitor = await fetch(base + '/checkin/monitor?eventId=' + firstOwnId)
  assert(anonymousMonitor.status === 401, 'anonymous user cannot view admission operations')
  const unauthorizedMonitor = await fetch(base + '/checkin/monitor?eventId=' + firstOwnId, {
    headers: { Cookie: attendee },
  })
  assert(unauthorizedMonitor.status === 403, 'ordinary attendee cannot monitor check-in operations')
  const organizerMonitor = await fetch(base + '/checkin/monitor?eventId=' + firstOwnId, {
    headers: { Cookie: pastor },
  })
  const organizerMonitorData = await organizerMonitor.json()
  assert(organizerMonitor.status === 200 &&
    organizerMonitorData.eventId === firstOwnId &&
    Number.isInteger(organizerMonitorData.totals.admitted) &&
    Number.isInteger(organizerMonitorData.totals.validToAdmit) &&
    Array.isArray(organizerMonitorData.scanners) &&
    Array.isArray(organizerMonitorData.alerts) &&
    Array.isArray(organizerMonitorData.devices),
    'accepted organizer can load read-only, event-scoped admission operations')
  const disallowedFields = ['ticketId', 'holderName', 'holderEmail', 'code', 'qrSecret', 'tokenHash', 'deviceToken', 'payload']
  const secretLeak = JSON.stringify(organizerMonitorData)
  assert(!disallowedFields.some((field) => secretLeak.includes('"' + field + '"')),
    'monitoring payload omits ticket credentials, attendee PII and device secrets')
  assert(organizerMonitor.headers.get('cache-control')?.includes('no-store'),
    'private monitoring response is never cached')
  const otherOrgEvent = await db.event.findFirstOrThrow({ where: { orgId: ministries.id }, select: { id: true } })
  const forbiddenMonitor = await fetch(base + '/checkin/monitor?eventId=' + otherOrgEvent.id, {
    headers: { Cookie: pastor },
  })
  assert(forbiddenMonitor.status === 403, 'organizer cannot monitor a different organization event')

  const crossOrgEvent = await list(pastor, 'mine=1&orgId=' + chapel.id + '&eventId=' + otherOrgEvent.id)
  assert(crossOrgEvent.status === 200 && crossOrgEvent.data.total === 0 && crossOrgEvent.data.items.length === 0,
    'organizer cannot retrieve another organization event by guessed id')
  assert((await list(attendee, 'mine=1&orgId=' + chapel.id + '&eventId=' + firstOwnId)).status === 403,
    'attendee cannot use targeted event lookup without an accepted membership')
  assert((await list(pastor, 'mine=1&orgId=' + chapel.id + '&eventId=..%2Fsecret')).status === 400,
    'malformed targeted event IDs are rejected')
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

  // Synthetic scanner session: tenant ownership, audit, and immediate
  // revocation are checked over real HTTP. No ticket is scanned.
  const registerResponse = await fetch(base + '/checkin/device-sessions', {
    method: 'POST', headers: { Cookie: pastor, 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: firstOwnId, name: 'CI synthetic Gate A' }),
  })
  assert(registerResponse.status === 200, 'organizer may register a named device session')
  const registered = await registerResponse.json()
  const sessionId = String(registered.deviceSessionId)
  try {
    const updateSession = async (cookie: string, eventId: string, operation: string, name?: string) =>
      fetch(base + '/checkin/device-sessions', {
        method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, deviceSessionId: sessionId, operation, name }),
      })
    const listing = await fetch(base + '/checkin/device-sessions?eventId=' + firstOwnId,
      { headers: { Cookie: pastor } })
    const listed = await listing.json()
    assert(listing.status === 200 && !JSON.stringify(listed).includes('tokenHash'),
      'scanner inventory never exposes token hashes')
    assert((await updateSession(attendee, firstOwnId, 'REVOKE')).status === 403,
      'unrelated attendee may not revoke the event scanner')
    assert((await updateSession(pastor, otherOrgEvent.id, 'REVOKE')).status === 403,
      'scanner mutations cannot cross organization boundaries')
    assert((await updateSession(pastor, firstOwnId, 'RENAME', 'Approved Gate A')).status === 200,
      'organizer may rename its scanner')
    const snapshot = await fetch(base + '/checkin/monitor?eventId=' + firstOwnId,
      { headers: { Cookie: pastor } }).then((response) => response.json())
    assert(snapshot.devices.some((device: { id: string; canManage: boolean }) =>
      device.id === sessionId && device.canManage),
      'monitor marks organizer-owned scanners manageable')
    assert((await updateSession(pastor, firstOwnId, 'REVOKE')).status === 200,
      'organizer may revoke its scanner')
    const revokedScan = await fetch(base + '/checkin/scan', {
      method: 'POST', headers: { Cookie: pastor, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: firstOwnId, deviceSessionId: sessionId,
        payload: 'SYNTHETIC-NO-TICKET', clientScanId: 'synthetic-revoked-smoke' }),
    })
    assert(revokedScan.status === 403, 'revoked scanner cannot submit ticket scans')
    const revokedSync = await fetch(base + '/checkin/sync', {
      method: 'POST', headers: { Cookie: pastor, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: firstOwnId, deviceSessionId: sessionId, scans: [] }),
    })
    assert(revokedSync.status === 403, 'revoked scanner cannot synchronize scans')
    const actions = await db.auditLog.findMany({
      where: { entityType: 'DeviceSession', entityId: sessionId }, select: { action: true },
    })
    assert(actions.some((row) => row.action === 'CHECKIN_SCANNER_RENAMED') &&
      actions.some((row) => row.action === 'CHECKIN_SCANNER_REVOKED'),
      'rename and revocation have durable audit events')
  } finally {
    await db.auditLog.deleteMany({ where: { entityType: 'DeviceSession', entityId: sessionId } })
    await db.deviceSession.delete({ where: { id: sessionId } })
  }

  const broadcast = await db.liveBroadcast.findFirstOrThrow({
    where: { event: { visibility: 'PUBLIC', status: 'LIVE' } },
    select: { eventId: true },
  })
  const detail = await fetch(base + '/events/' + broadcast.eventId).then((res) => res.json())
  assert((detail.event?.broadcasts ?? []).length > 0, 'public event detail includes broadcast metadata')
  const secretFields = ['ingestUrl', 'streamKeyHash', 'streamKeyId', 'recordingUrl', 'createdById']
  assert(
    detail.event.broadcasts.every((row: Record<string, unknown>) => secretFields.every((field) => !(field in row))),
    'event detail never exposes internal broadcaster credentials or recording origins',
  )
  assert(!('media' in detail.event), 'event response omits raw internal media records')

  const inviteEvent = await db.event.findFirstOrThrow({
    where: { visibility: 'INVITE_ONLY', venueId: { not: null } },
    select: { id: true },
  })
  const invitation = await fetch(base + '/events/' + inviteEvent.id).then((res) => res.json())
  assert(Boolean(invitation.event), 'invitation-only landing page stays reachable by direct link')
  const guestCalendar = await fetch(base + '/events/' + inviteEvent.id + '/ics')
  assert(guestCalendar.status === 401, 'anonymous users cannot export private-event venue by calendar')
  const unrelatedCalendar = await fetch(base + '/events/' + inviteEvent.id + '/ics', { headers: { Cookie: attendee } })
  assert(unrelatedCalendar.status === 403, 'signed-in but unapproved attendees cannot download exact private venue address')
  const invitationHost = await db.event.findUniqueOrThrow({
    where: { id: inviteEvent.id },
    select: { org: { select: { memberships: {
      where: { role: 'OWNER', acceptedAt: { not: null } },
      take: 1, select: { user: { select: { email: true } } },
    } } } },
  })
  const hostEmail = invitationHost.org.memberships[0]?.user.email
  assert(Boolean(hostEmail), 'invitation-only event has an accepted owner in the seed')
  const hostCookie = await auth(hostEmail!)
  const hostCalendar = await fetch(base + '/events/' + inviteEvent.id + '/ics', { headers: { Cookie: hostCookie } })
  assert(hostCalendar.status === 200, 'accepted organizer can export its private-event calendar')
  assert(
    invitation.event.venue?.mapsUrl === null && invitation.event.venue?.address === null &&
      invitation.event.venue?.lat === null && invitation.event.directionsUrl === null && invitation.event.venueId === null,
    'unauthorized invitation-only visitor receives no precise venue, map, directions or venue identifier',
  )

  // A real DRAFT must stay hidden from anonymous public API reads while its
  // authenticated organizer can still preview it. Remove the test row afterward.
  const seriesParent = await db.event.findFirstOrThrow({
    where: { orgId: chapel.id, seriesId: { not: null }, status: 'PUBLISHED' },
    select: { id: true, seriesId: true },
  })
  const draft = await db.event.create({
    data: {
      orgId: chapel.id,
      seriesId: seriesParent.seriesId,
      title: 'Private security regression event',
      slug: 'private-security-smoke-' + Date.now(),
      description: 'Development-only draft fixture.',
      categorySlug: 'community',
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
      status: 'DRAFT',
    },
  })
  try {
    const scopedDraft = await list(pastor, 'mine=1&orgId=' + chapel.id + '&eventId=' + draft.id)
    assert(scopedDraft.status === 200 && scopedDraft.data.items[0]?.id === draft.id,
      'accepted organizer can select its own unpublished event for private attendee management')
    const guestDraft = await fetch(base + '/events/' + draft.id)
    assert(guestDraft.status === 404, 'anonymous cannot read unpublished event details')
    const organizerDraft = await fetch(base + '/events/' + draft.id, { headers: { Cookie: pastor } })
    assert(organizerDraft.status === 200, 'accepted organizer can preview an unpublished event')
    const guestAgenda = await fetch(base + '/events/' + draft.id + '/agenda')
    assert(guestAgenda.status === 404, 'anonymous cannot read unpublished agendas')
    const guestDraftCalendar = await fetch(base + '/events/' + draft.id + '/ics')
    assert(guestDraftCalendar.status === 404, 'anonymous cannot export unpublished event calendar')
    const guestSeries = await fetch(base + '/events/' + seriesParent.id + '/series').then((response) => response.json())
    assert(!guestSeries.occurrences.some((row: { id: string }) => row.id === draft.id), 'public series list never leaks draft occurrences')
    const organizerSeries = await fetch(base + '/events/' + seriesParent.id + '/series', { headers: { Cookie: pastor } }).then((response) => response.json())
    assert(organizerSeries.occurrences.some((row: { id: string }) => row.id === draft.id), 'organizer series preview includes its own unpublished occurrence')
  } finally {
    await db.event.delete({ where: { id: draft.id } })
  }
}

main().catch((err) => {
  console.error('ORG EVENT PRIVACY SMOKE FAILED:', err)
  process.exitCode = 1
}).finally(() => db.$disconnect())
