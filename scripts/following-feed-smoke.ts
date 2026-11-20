/**
 * DEV-SEED-ONLY real HTTP/privacy integration test for the Following feed.
 * Creates only synthetic events, organizer updates, follow and block state.
 * Cleanup runs even when an assertion fails; production execution refused.
 */
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../src/lib/db'

const base = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '')
const target = new URL(base)
if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Following feed smoke is permitted only on a development seed stack bound to localhost.')
}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error('Following feed smoke failed: ' + message)
  console.log('PASS ' + message)
}

async function main() {
  const attendee = await db.user.findUniqueOrThrow({ where: { email: 'ama@example.dev' } })
  const chapel = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-chapel' } })
  const pendingOrg = await db.organization.findUniqueOrThrow({ where: { slug: 'accra-events-co' } })
  const preexistingFollow = await db.follow.findFirst({ where: { followerId: attendee.id, orgId: chapel.id } })
  const preexistingBlock = await db.userBlock.findFirst({ where: { blockerId: attendee.id, blockedId: chapel.ownerId } })
  const token = randomBytes(32).toString('base64url')
  const session = await db.session.create({
    data: {
      userId: attendee.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  })
  const cookie = 'ievx_session=' + token
  const testId = randomBytes(8).toString('hex')
  const eventIds: string[] = []
  let organizerSessionId: string | null = null

  async function call(path: string, options: { method?: string; body?: Record<string, unknown>; authenticated?: boolean } = {}) {
    const response = await fetch(base + path, {
      method: options.method ?? 'GET',
      headers: { ...(options.authenticated === false ? {} : { Cookie: cookie }), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const payload = await response.json().catch(() => ({}))
    return { status: response.status, payload, headers: response.headers }
  }

  try {
    check((await call('/social/feed', { authenticated: false })).status === 401, 'guest cannot read the personalized feed')
    check((await call('/social/feed?cursor=invalid-base64')).status === 400, 'bad cursor returns 400 without a stack trace')
    check((await call('/social/follow', { method: 'POST', body: { orgId: pendingOrg.id } })).status === 404, 'pending organizer cannot be followed')
    check((await call('/social/follow', { method: 'POST', body: { orgId: chapel.id } })).status === 200, 'attendee can follow active organizer')

    const start = new Date(Date.now() + 7 * 86400000)
    const end = new Date(start.getTime() + 2 * 3600000)
    const publicEvent = await db.event.create({ data: {
      orgId: chapel.id, title: 'Following public regression ' + testId,
      slug: 'following-public-' + testId, description: 'Synthetic feed contract test.',
      categorySlug: 'community', startsAt: start, endsAt: end,
      status: 'PUBLISHED', visibility: 'PUBLIC',
    } })
    eventIds.push(publicEvent.id)
    const privateEvent = await db.event.create({ data: {
      orgId: chapel.id, title: 'Following unlisted regression ' + testId,
      slug: 'following-unlisted-' + testId, description: 'Must not be in the public Following feed.',
      categorySlug: 'community', startsAt: start, endsAt: end,
      status: 'PUBLISHED', visibility: 'UNLISTED',
    } })
    eventIds.push(privateEvent.id)
    // Organizer can inspect their own event, and cannot follow themselves.
    const creatorToken = randomBytes(32).toString('base64url')
    const creatorSession = await db.session.create({
      data: {
        userId: chapel.ownerId,
        tokenHash: createHash('sha256').update(creatorToken).digest('hex'),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    })
    organizerSessionId = creatorSession.id
    const creatorHeaders = { Cookie: 'ievx_session=' + creatorToken }
    const creatorEvent = await fetch(base + '/events/' + publicEvent.id, { headers: creatorHeaders })
    const creatorEventData = await creatorEvent.json()
    check(creatorEvent.status === 200 && creatorEventData.isEventHost === true,
      'organizer owner is recognized as host, not attendee')
    const creatorOrg = await fetch(base + '/orgs/' + chapel.slug + '/profile', { headers: creatorHeaders })
    const creatorOrgData = await creatorOrg.json()
    check(creatorOrg.status === 200 && creatorOrgData.myOrg === true,
      'creator sees own organization as manageable')
    const selfFollow = await fetch(base + '/social/follow', {
      method: 'POST', headers: { ...creatorHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: chapel.id }),
    })
    check(selfFollow.status === 400, 'organizer owner cannot follow their own organization')

    const publicUpdate = await db.eventUpdate.create({ data: {
      eventId: publicEvent.id, orgId: chapel.id, title: 'Public announcement ' + testId,
      body: 'Synthetic event update for the Following feed.', important: true,
    } })
    await db.eventUpdate.create({ data: {
      eventId: privateEvent.id, orgId: chapel.id, title: 'Private announcement ' + testId,
      body: 'Should be hidden from followers without an invitation.',
    } })

    const first = await call('/social/feed?pageSize=1')
    check(first.status === 200 && first.payload.items?.length === 1 && first.payload.hasMore === true && Boolean(first.payload.nextCursor), 'authenticated timeline supports cursor pagination')
    check(first.headers.get('cache-control')?.includes('no-store'), 'personalized activity is never cached publicly')
    const second = await call('/social/feed?pageSize=1&cursor=' + encodeURIComponent(first.payload.nextCursor))
    check(second.status === 200 && second.payload.items?.length === 1, 'second feed page loads')
    check(first.payload.items[0].id !== second.payload.items[0].id, 'cross-table pages do not duplicate activities')

    const all = await call('/social/feed?pageSize=24')
    check(all.status === 200 && all.payload.items?.some((item: { id: string }) => item.id === publicUpdate.id), 'public organizer announcement appears in follower timeline')
    check(all.payload.items?.some((item: { kind: string; event: { id: string } }) => item.kind === 'EVENT' && item.event.id === publicEvent.id), 'public event appears in follower timeline')
    check(all.payload.items?.every((item: { event: { id: string } }) => item.event.id !== privateEvent.id), 'unlisted event and its announcement stay hidden')

    if (!preexistingBlock) {
      await db.userBlock.create({ data: { blockerId: attendee.id, blockedId: chapel.ownerId } })
      const blocked = await call('/social/feed?pageSize=24')
      check(blocked.status === 200 && blocked.payload.items?.every((item: { event: { id: string } }) => item.event.id !== publicEvent.id), 'blocking organizer owner hides their feed activity')
      check((await call('/social/follow', { method: 'POST', body: { orgId: chapel.id } })).status === 403, 'cannot follow a blocked organizer owner')
      await db.userBlock.delete({ where: { blockerId_blockedId: { blockerId: attendee.id, blockedId: chapel.ownerId } } })
    }

    check((await call('/social/unfollow', { method: 'POST', body: { orgId: chapel.id } })).status === 200, 'unfollow accepts active organizer')
    const afterUnfollow = await call('/social/feed?pageSize=24')
    check(afterUnfollow.status === 200 && afterUnfollow.payload.items?.every((item: { event: { id: string } }) => item.event.id !== publicEvent.id), 'unfollow removes organizer activity from personal feed')
  } finally {
    if (!preexistingBlock) await db.userBlock.deleteMany({ where: { blockerId: attendee.id, blockedId: chapel.ownerId } })
    await db.eventUpdate.deleteMany({ where: { eventId: { in: eventIds } } })
    await db.event.deleteMany({ where: { id: { in: eventIds } } })
    await db.follow.deleteMany({ where: { followerId: attendee.id, orgId: chapel.id } })
    if (preexistingFollow) {
      await db.follow.create({ data: { id: preexistingFollow.id, followerId: attendee.id, orgId: chapel.id, createdAt: preexistingFollow.createdAt } })
    }
    if (organizerSessionId) await db.session.deleteMany({ where: { id: organizerSessionId } })
    await db.session.delete({ where: { id: session.id } })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
