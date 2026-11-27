/**
 * Awards lifecycle and concurrent free voting against disposable GitHub CI
 * database ONLY. Creates and deletes its own synthetic published event.
 * Never invoke with live organizer/customer records or real money providers.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import {castCompetitionVote} from '../src/server/services/competitions'

const BASE = 'http://127.0.0.1:3000/api/v1'
if (process.env.CI !== 'true' || process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes' ||
  process.env.NODE_ENV === 'production') {
  throw new Error('Competition smoke may run only in isolated GitHub CI.')
}
if (!process.env.DATABASE_URL?.includes('@localhost:5432/ieventplux') &&
  !process.env.DATABASE_URL?.includes('@127.0.0.1:5432/ieventplux')) {
  throw new Error('Competition smoke requires localhost disposable CI PostgreSQL.')
}

type Payload = Record<string, any>
function assert(condition: unknown, label: string) {
  if (!condition) throw new Error('AWARDS SMOKE FAILURE: ' + label)
  console.log('PASS ' + label)
}
async function login(email: string) {
  const response = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Dev@12345' }),
  })
  assert(response.status === 200, 'seeded login ' + email)
  const cookie = (response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie') ?? '').split(';')[0]
  assert(cookie.startsWith('ievx_session='), 'signed-in session cookie')
  return cookie
}
async function call(method: string, path: string, cookie?: string, body?: unknown): Promise<{ status: number; data: Payload; headers: Headers }> {
  const response = await fetch(BASE + path, {
    method, headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data, headers:response.headers }
}

let eventId: string | null = null
try {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-chapel' } })
  const organizer = await db.user.findUniqueOrThrow({ where: { email: 'pastor@lightworld.dev' } })
  assert(org.status === 'ACTIVE' && org.ownerId === organizer.id, 'authorized seeded organizer')
  const event = await db.event.create({
    data: {
      orgId: org.id, title: 'CI Awards Voting Rehearsal',
      slug: 'ci-awards-' + randomUUID().slice(0, 12).toLowerCase(),
      description: 'Synthetic awards event. Removed after smoke testing.',
      categorySlug: 'festival', status: 'PUBLISHED', visibility: 'PUBLIC', mode: 'VIRTUAL',
      publishedAt: new Date(),
      startsAt: new Date(Date.now() + 3_600_000),
      endsAt: new Date(Date.now() + 7_200_000),
      createdBy: organizer.id,
    },
  })
  eventId = event.id
  const host = await login('pastor@lightworld.dev')
  const fanA = await login('ama@example.dev')
  const fanB = await login('kojo@example.dev')
  assert((await call('GET', '/events/' + eventId + '/competitions')).status === 200, 'public empty competition list')
  const start = new Date(Date.now() - 35_000).toISOString()
  const end = new Date(Date.now() + 24 * 3_600_000).toISOString()
  const payload = {
    title: 'CI Music and Talent Awards', description: 'Synthetic fan-vote test.',
    votingStartsAt: start, votingEndsAt: end, resultsVisibility: 'AFTER_CLOSE', votingMethod: 'FREE',
    categories: [
      { title: 'Best Artist', nominees: [{ name: 'Artist One' }, { name: 'Artist Two' }] },
      { title: 'Best Performer', nominees: [{ name: 'Performer A' }, { name: 'Performer B' }] },
    ],
  }
  assert((await call('POST', '/events/' + eventId + '/competitions', fanA, payload)).status === 403,
    'ordinary supporter cannot create awards')
  assert((await call('POST', '/events/' + eventId + '/competitions', host, { ...payload, votingMethod: 'PAID' })).status === 400,
    'paid votes cannot be activated without settlement ledger')
  const created = await call('POST', '/events/' + eventId + '/competitions', host, payload)
  assert(created.status === 201 && typeof created.data.competition?.id === 'string', 'organizer creates draft')
  const id = created.data.competition.id as string
  const publicBefore = await call('GET', '/events/' + eventId + '/competitions', fanA)
  assert(publicBefore.status === 200 && publicBefore.data.competitions.length === 0,
    'public supporters cannot see drafts')
  assert((await call('PATCH', '/competitions/' + id, fanA, payload)).status === 403,
    'supporter cannot edit draft')

  const edited = await call('PATCH', '/competitions/' + id, host, {
    ...payload, description: 'Updated synthetic contest.',
  })
  assert(edited.status === 200, 'organizer can edit nominations before voting opens')
  const draft = await call('GET', '/events/' + eventId + '/competitions', host)
  assert(draft.status === 200 && draft.data.competitions[0]?.description === 'Updated synthetic contest.',
    'organizer sees private draft')
  const categories = draft.data.competitions[0].categories as {
    id: string; nominees: { id: string; name: string }[]
  }[]
  const categoryA = categories[0], categoryB = categories[1]

  assert((await call('POST', '/competitions/' + id + '/open', fanA, {})).status === 403,
    'supporter cannot open voting')
  assert((await call('POST', '/competitions/' + id + '/open', host, {})).status === 200,
    'organizer opens voting')
  const publicOpen = await call('GET', '/events/' + eventId + '/competitions', fanA)
  assert(publicOpen.headers.get('cache-control')?.includes('no-store'),'personal ballot snapshot is not cacheable')
  assert(publicOpen.status === 200 && publicOpen.data.competitions[0]?.countsVisible === false &&
    publicOpen.data.competitions[0]?.totalVotes === null,
    'public vote totals withheld until close')
  assert((await call('POST', '/competitions/' + id + '/vote', undefined, {
    categoryId: categoryA.id, nomineeId: categoryA.nominees[0].id,
  })).status === 401, 'anonymous ballots rejected')
  assert((await call('POST', '/competitions/' + id + '/vote', fanA, {
    categoryId: categoryA.id, nomineeId: categoryB.nominees[0].id,
  })).status === 400, 'cross-category nominee substitution rejected')

  const a = await call('POST', '/competitions/' + id + '/vote', fanA, {
    categoryId: categoryA.id, nomineeId: categoryA.nominees[0].id,
  })
  assert(a.status === 201 && a.data.accepted, 'supporter A free ballot accepted')
  assert((await call('POST', '/competitions/' + id + '/vote', fanA, {
    categoryId: categoryA.id, nomineeId: categoryA.nominees[1].id,
  })).status === 409, 'second nominee vote in same category blocked')
  const b = await call('POST', '/competitions/' + id + '/vote', fanB, {
    categoryId: categoryA.id, nomineeId: categoryA.nominees[1].id,
  })
  assert(b.status === 201, 'second supporter may vote for another nominee')

  const race = await Promise.all([0, 1].map(() => call('POST', '/competitions/' + id + '/vote', fanB, {
    categoryId: categoryB.id, nomineeId: categoryB.nominees[0].id,
  })))
  assert(race.filter(row => row.status === 201).length === 1 &&
    race.filter(row => row.status === 409).length === 1,
    'concurrent duplicate requests produce one ballot and one conflict')
  const personal = await call('GET', '/events/' + eventId + '/competitions', fanA)
  assert(personal.data.competitions[0]?.categories[0]?.myNomineeId === categoryA.nominees[0].id &&
    personal.data.competitions[0]?.totalVotes === null,
    'supporter sees own choice but not hidden totals')
  const privateCounts = await call('GET', '/events/' + eventId + '/competitions', host)
  assert(privateCounts.data.competitions[0]?.totalVotes === 3,
    'organizer sees three verified votes')
  assert((await call('PATCH', '/competitions/' + id, host, payload)).status === 409,
    'organizer cannot edit candidates once voting starts')
  assert((await call('DELETE', '/competitions/' + id, host)).status === 409,
    'organizer cannot delete an active competition with votes')
  assert(await db.auditLog.count({where:{entityType:'EventCompetition',entityId:id,action:'competition.vote'}})===3,'only accepted ballots create one audit each')
  await db.event.update({where:{id:eventId},data:{visibility:'INVITE_ONLY'}})
  const fanUser=await db.user.findUniqueOrThrow({where:{email:'ama@example.dev'}})
  assert((await call('GET','/events/'+eventId+'/competitions',fanA)).status===404,'private event ballot read denied without entitlement')
  let denied=false
  try{await castCompetitionVote({competitionId:id,categoryId:categoryB.id,nomineeId:categoryB.nominees[1].id,userId:fanUser.id})}catch(err){denied=!!err&&typeof err==='object'&&'status' in err&&err.status===404}
  assert(denied,'direct service rejects unauthorized private ballot inside transaction')
  const rsvp=await db.rsvp.create({data:{eventId,userId:fanUser.id,name:'Synthetic approved fan',status:'APPROVED'}})
  assert((await call('GET','/events/'+eventId+'/competitions',fanA)).status===200,'approved private attendee can view ballots')
  await db.rsvp.update({where:{id:rsvp.id},data:{status:'DECLINED'}})
  assert((await call('POST','/competitions/'+id+'/vote',fanA,{categoryId:categoryB.id,nomineeId:categoryB.nominees[1].id})).status===404,'revoked attendee cannot vote')
  await db.event.update({where:{id:eventId},data:{visibility:'PUBLIC'}})
  assert((await call('POST', '/competitions/' + id + '/close', host, {})).status === 200,
    'organizer closes competition')
  const final = await call('GET', '/events/' + eventId + '/competitions', fanA)
  assert(final.data.competitions[0]?.countsVisible === true &&
    final.data.competitions[0]?.totalVotes === 3,
    'public results reveal exactly three votes after close')
  assert((await call('POST', '/competitions/' + id + '/vote', fanA, {
    categoryId: categoryB.id, nomineeId: categoryB.nominees[1].id,
  })).status === 409, 'ballots rejected after competition closes')
  console.log('AWARDS_SMOKE_PASS')
} finally {
  if (eventId) {
    await db.event.delete({ where: { id: eventId } })
    console.log('Synthetic awards event and its votes deleted from isolated CI DB.')
  }
  await db.$disconnect()
}
