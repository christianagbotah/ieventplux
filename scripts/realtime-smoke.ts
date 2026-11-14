/**
 * Realtime authorization integration smoke — against CI's real Next/worker/socket
 * stack and seeded DEV database. NEVER run on production/customer data.
 *
 * - anonymous sockets must NOT join someone's notification/broadcast rooms;
 * - an authenticated user may join only their own private notification room;
 * - a public event room remains available to anonymous visitors.
 */
import { io, type Socket } from 'socket.io-client'
import { db } from '../src/lib/db'

const SOCKET_URL = process.env.REALTIME_SMOKE_URL ?? 'http://127.0.0.1:3003'
const API_URL = process.env.REALTIME_SMOKE_API ?? 'http://127.0.0.1:3000'

async function connect(cookie?: string): Promise<Socket> {
  const socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: false,
    timeout: 7000,
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timeout')), 8000)
    socket.once('connect', () => { clearTimeout(timer); resolve() })
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error) })
    socket.connect()
  })
  return socket
}

async function roomVerdict(socket: Socket, room: string): Promise<'joined' | 'denied'> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Room verdict timeout for ' + room.split(':')[0])), 8000)
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('room:joined', accepted)
      socket.off('room:denied', refused)
    }
    const accepted = () => { cleanup(); resolve('joined') }
    const refused = () => { cleanup(); resolve('denied') }
    socket.on('room:joined', accepted)
    socket.on('room:denied', refused)
    socket.emit('join', { room })
  })
}

function assertVerdict(actual: string, expected: string, name: string) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected} but got ${actual}`)
  console.log('PASS ' + name)
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Realtime integration smoke is development/CI-only.')
  const users = await db.user.findMany({ select: { id: true, email: true }, take: 10 })
  const admin = users.find((user) => user.email === 'admin@ieventplux.dev')
  const other = users.find((user) => user.id !== admin?.id)
  if (!admin || !other) throw new Error('Seeded development users are required.')
  const broadcast = await db.liveBroadcast.findFirst({ select: { id: true } })
  const publicEvent = await db.event.findFirst({ where: { visibility: 'PUBLIC', status: { in: ['PUBLISHED', 'LIVE'] } }, select: { id: true } })
  if (!broadcast || !publicEvent) throw new Error('Seeded public event and broadcast required.')

  const anonymous = await connect()
  try {
    assertVerdict(await roomVerdict(anonymous, 'user:' + admin.id), 'denied', 'anonymous user-room impersonation denied')
    assertVerdict(await roomVerdict(anonymous, 'broadcast:' + broadcast.id), 'denied', 'anonymous broadcast eavesdropping denied')
    assertVerdict(await roomVerdict(anonymous, 'event:' + publicEvent.id), 'joined', 'public event remains open')
  } finally {
    anonymous.disconnect()
  }

  const response = await fetch(API_URL + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: 'Dev@12345' }),
  })
  if (!response.ok) throw new Error('Seeded dev login failed: ' + response.status)
  const rawCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
  const cookie = rawCookie?.split(';')[0]
  if (!cookie?.startsWith('ievx_session=')) throw new Error('Missing signed-in session cookie')
  const authorized = await connect(cookie)
  try {
    assertVerdict(await roomVerdict(authorized, 'user:' + admin.id), 'joined', 'authenticated user joins own notification room')
    assertVerdict(await roomVerdict(authorized, 'user:' + other.id), 'denied', 'authenticated user cannot join another account')
  } finally {
    authorized.disconnect()
  }
}
main().catch((error) => {
  console.error('Realtime authorization smoke FAILED:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => {
  await db.$disconnect()
})
