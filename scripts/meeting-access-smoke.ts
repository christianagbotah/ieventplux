/**
 * Interactive group meeting integration smoke against the SEEDED CI-ONLY stack.
 * This creates one isolated synthetic event then deletes it and all its
 * meeting/chat/ban records. NEVER run against production or client data.
 */
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import { db } from '../src/lib/db'

const base = 'http://127.0.0.1:3000/api/v1'
const realtime = 'http://127.0.0.1:3003'
if (process.env.CI !== 'true' || process.env.NODE_ENV === 'production' ||
    process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes') {
  throw new Error('Meeting smoke is only permitted against the disposable CI environment.')
}
if (!process.env.DATABASE_URL?.includes('@localhost:5432/ieventplux') &&
    !process.env.DATABASE_URL?.includes('@127.0.0.1:5432/ieventplux')) {
  throw new Error('Meeting smoke requires the CI localhost PostgreSQL database.')
}

type Json = Record<string, any>
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message)
  console.log('PASS ' + message)
}
async function login(email: string): Promise<string> {
  const result = await fetch(base + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Dev@12345' }),
  })
  assert(result.ok, 'development login ' + email)
  const cookie = (result.headers.getSetCookie?.()[0] ?? result.headers.get('set-cookie') ?? '').split(';')[0]
  assert(cookie.startsWith('ievx_session='), 'signed-in development session')
  return cookie
}
async function request(method: string, route: string, cookie?: string, body?: Json) {
  const response = await fetch(base + route, {
    method, headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({})) as Json
  return { status: response.status, data, headers: response.headers }
}
async function connect(cookie?: string): Promise<Socket> {
  const socket = io(realtime, {
    autoConnect: false, transports: ['websocket'], reconnection: false,
    timeout: 8000, extraHeaders: cookie ? { Cookie: cookie } : undefined,
  })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 8000)
    socket.once('connect', () => { clearTimeout(timeout); resolve() })
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error) })
    socket.connect()
  })
  return socket
}
async function join(socket: Socket, room: string): Promise<'joined' | 'denied'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Meeting room join timeout')), 8000)
    const success = (data: { room: string }) => {
      if (data.room !== room) return
      cleanup(); resolve('joined')
    }
    const denied = () => { cleanup(); resolve('denied') }
    function cleanup() {
      clearTimeout(timer)
      socket.off('room:joined', success)
      socket.off('room:denied', denied)
    }
    socket.on('room:joined', success)
    socket.on('room:denied', denied)
    socket.emit('join', { room })
  })
}
function expectSocket<T>(socket: Socket, event: string, valid: (payload: T) => boolean) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error('Socket event timeout: ' + event)) }, 8000)
    const listener = (payload: T) => {
      if (!valid(payload)) return
      clearTimeout(timer); socket.off(event, listener); resolve(payload)
    }
    socket.on(event, listener)
  })
}

async function main() {
  const sockets: Socket[] = []
  let eventId: string | undefined
  try {
    const chapel = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-chapel' } })
    assert(chapel.status === 'ACTIVE', 'seeded active organizer available')
    const pastor = await db.user.findUniqueOrThrow({ where: { email: 'pastor@lightworld.dev' } })
    const attendee = await db.user.findUniqueOrThrow({ where: { email: 'ama@example.dev' } })
    assert(chapel.ownerId === pastor.id && attendee.id !== pastor.id, 'separate organizer and attendee identities')
    const suffix = randomUUID().slice(0, 10).toLowerCase()
    const created = await db.event.create({
      data: {
        orgId: chapel.id, title: 'CI group meeting access rehearsal',
        slug: 'ci-meeting-access-' + suffix,
        description: 'Synthetic test event. Removed by the test after completion.',
        categorySlug: 'conference', mode: 'VIRTUAL', visibility: 'PUBLIC',
        status: 'PUBLISHED', publishedAt: new Date(),
        startsAt: new Date(Date.now() + 3600_000),
        endsAt: new Date(Date.now() + 7200_000),
        createdBy: pastor.id,
      },
    })
    eventId = created.id
    const host = await login('pastor@lightworld.dev')
    const guest = await login('ama@example.dev')

    assert((await request('GET', `/events/${eventId}/meeting`, host)).status === 200,
      'host can inspect meeting creation panel')
    assert((await request('POST', `/events/${eventId}/meeting`, guest, { maxParticipants: 2 })).status === 403,
      'ordinary attendee cannot create an organizer room')
    const response = await request('POST', `/events/${eventId}/meeting`, host, {
      title: 'CI authorized group call', maxParticipants: 2, chatEnabled: true, screenShareEnabled: true,
    })
    assert(response.status === 201 && typeof response.data.meeting?.id === 'string',
      'host creates two-peer event meeting')
    const meetingId = response.data.meeting.id as string

    assert((await request('GET', `/meetings/${meetingId}/detail`, guest)).status === 403,
      'uninvited attendee cannot discover meeting details')
    assert((await request('GET', `/meetings/${meetingId}/chat`, guest)).status === 403,
      'uninvited attendee cannot read group conversation')

    const anonymous = await connect()
    sockets.push(anonymous)
    assert(await join(anonymous, `meeting:${meetingId}`) === 'denied', 'anonymous video socket denied')
    assert(await join(anonymous, `meeting-chat:${meetingId}`) === 'denied', 'anonymous group chat socket denied')
    const guestBefore = await connect(guest)
    sockets.push(guestBefore)
    assert(await join(guestBefore, `meeting-chat:${meetingId}`) === 'denied',
      'guessing the chat room cannot bypass RSVPs')

    const approvedRsvp = await db.rsvp.create({
      data: { eventId, userId: attendee.id, name: attendee.displayName, email: attendee.email,
        status: 'APPROVED', guests: 1, decidedAt: new Date(), decidedBy: pastor.id },
    })
    assert((await request('GET', `/meetings/${meetingId}/detail`, guest)).status === 200,
      'approved RSVP unlocks meeting details')
    const hostChat = await connect(host)
    const guestChat = await connect(guest)
    sockets.push(hostChat, guestChat)
    assert(await join(hostChat, `meeting-chat:${meetingId}`) === 'joined',
      'host joins real-time group chat before video')
    assert(await join(guestChat, `meeting-chat:${meetingId}`) === 'joined',
      'RSVP attendee joins real-time chat before video')
    const relayedChat = expectSocket<{ id: string }>(hostChat, 'meeting:chat', (p) => !!p.id)
    const sent = await request('POST', `/meetings/${meetingId}/chat`, guest, { body: 'Hello from the event group' })
    assert(sent.status === 201 && !!sent.data.message?.id, 'approved attendee writes a durable chat message')
    const confirmed = await relayedChat
    assert(confirmed.id === sent.data.message.id, 'chat relay sends only persisted message to other members')
    assert((await request('GET', `/meetings/${meetingId}/chat`, host)).data.items?.length === 1,
      'chat history survives without an active call')

    assert((await request('POST', `/meetings/${meetingId}/start`, guest)).status === 403,
      'attendee cannot start the host meeting')
    assert((await request('POST', `/meetings/${meetingId}/start`, host)).status === 200,
      'host starts real-time meeting')
    const hostVideo = await connect(host)
    const guestVideo = await connect(guest)
    sockets.push(hostVideo, guestVideo)
    assert(await join(hostVideo, `meeting:${meetingId}`) === 'joined', 'host joins live video room')
    assert(await join(guestVideo, `meeting:${meetingId}`) === 'joined', 'approved attendee joins live video room')
    const extraVideo = await connect(guest)
    sockets.push(extraVideo)
    assert(await join(extraVideo, `meeting:${meetingId}`) === 'denied',
      'two-peer capacity blocks additional sockets')
    const gotOffer = expectSocket<{ kind: string; from: string; sdp: string }>(
      guestVideo, 'meeting:signal', (p) => p.kind === 'offer' && p.from === hostVideo.id,
    )
    hostVideo.emit('meeting:signal', { to: guestVideo.id, kind: 'offer', sdp: 'v=0' })
    assert((await gotOffer).sdp === 'v=0', 'authorized live-room SDP signaling delivered to intended peer')
    const gotScreen = expectSocket<{ peerId: string; sharing: boolean }>(
      guestVideo, 'meeting:screen', (p) => p.peerId === hostVideo.id && p.sharing === true,
    )
    hostVideo.emit('meeting:screen', { sharing: true })
    await gotScreen
    console.log('PASS authenticated presenter status delivered to peer')

    assert((await request('POST', `/meetings/${meetingId}/remove-participant`, host,
      { userId: attendee.id })).status === 200, 'host bans disruptive attendee')
    assert((await request('GET', `/meetings/${meetingId}/detail`, guest)).status === 403,
      'ban immediately blocks API access')
    const banned = await connect(guest)
    sockets.push(banned)
    assert(await join(banned, `meeting-chat:${meetingId}`) === 'denied',
      'ban persists across new chat socket connections')
    assert((await request('POST', `/meetings/${meetingId}/restore-participant`, host,
      { userId: attendee.id })).status === 200, 'host restores banned attendee')
    assert((await request('GET', `/meetings/${meetingId}/chat`, guest)).status === 200,
      'restored attendee can read chat again')

    assert((await request('POST', `/meetings/${meetingId}/end`, host)).status === 200,
      'host ends live call')
    const noVideo = await connect(guest)
    sockets.push(noVideo)
    assert(await join(noVideo, `meeting:${meetingId}`) === 'denied',
      'completed call cannot be rejoined for camera or screen sharing')
    assert(await join(noVideo, `meeting-chat:${meetingId}`) === 'joined',
      'ongoing chat remains available after the call')
    await db.event.update({ where: { id: eventId }, data: { status: 'ENDED' } })
    assert((await request('POST', `/meetings/${meetingId}/start`, host)).status === 409,
      'completed event cannot relaunch video sessions')
    assert((await request('POST', `/meetings/${meetingId}/chat`, guest, {
      body: 'Group conversation continues after the event',
    })).status === 201, 'ended events retain access-controlled chat')

    // Tickets/RSVPs may be revoked while a conversation is open. The private
    // server socket must terminate independently of browser UI polling.
    const revokedGuest = await connect(guest)
    sockets.push(revokedGuest)
    assert(await join(revokedGuest, `meeting-chat:${meetingId}`) === 'joined',
      'approved attendee maintains chat access after the event')
    const forcedDisconnect = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Stale chat socket survived revoked RSVP')), 8500)
      revokedGuest.once('disconnect', () => { clearTimeout(timer); resolve() })
    })
    await db.rsvp.update({ where: { id: approvedRsvp.id }, data: { status: 'DECLINED' } })
    await forcedDisconnect
    assert((await request('GET', `/meetings/${meetingId}/chat`, guest)).status === 403,
      'revoked RSVP loses access to durable group chat')
    console.log('PASS revoked attendee was evicted from a pre-existing private chat socket')
    console.log('PASS: full interactive event meeting API + socket authorization smoke.')
  } finally {
    for (const socket of sockets) socket.disconnect()
    if (eventId) await db.event.delete({ where: { id: eventId } }).catch((err) => {
      console.error('Could not remove synthetic CI fixture:', err)
      process.exitCode = 1
    })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error('Meeting integration smoke FAILED:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
