/**
 * Realtime authorization integration smoke — against CI's real Next/worker/socket
 * stack and seeded DEV database. NEVER run on production/customer data.
 *
 * - anonymous sockets must NOT join someone's notification/broadcast rooms;
 * - an authenticated user may join only their own private notification room;
 * - a public event room remains available to anonymous visitors.
 */
import { io, type Socket } from 'socket.io-client'
import { createHash } from 'node:crypto'
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
  const admin = await db.user.findUnique({ where: { email: 'admin@ieventplux.dev' }, select: { id: true, email: true } })
  if (!admin) throw new Error('Seeded development admin account is required.')
  const other = await db.user.findFirst({ where: { id: { not: admin.id } }, select: { id: true } })
  if (!other) throw new Error('At least two development users are required.')
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
  if (process.env.CI === 'true' && process.env.IEVENTPLUX_ISOLATED_DB_TEST === 'yes') {
    const target = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid')
    if (!['localhost','127.0.0.1'].includes(target.hostname) || target.port !== '5432' || target.pathname !== '/ieventplux') throw new Error('Disposable realtime fixture DB required.')
    const org = await db.organization.findFirstOrThrow({where:{status:'ACTIVE',deletedAt:null,ownerId:{not:admin.id},memberships:{none:{userId:admin.id,acceptedAt:{not:null}}}},select:{id:true}})
    const fixture = await db.event.create({data:{orgId:org.id,title:'CI realtime admission fixture',slug:'ci-realtime-admission-'+Date.now(),description:'Synthetic CI fixture.',categorySlug:'community',status:'PUBLISHED',visibility:'INVITE_ONLY',startsAt:new Date(Date.now()+86400000),endsAt:new Date(Date.now()+90000000)}})
    const expectEvicted = (socket:Socket) => new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Realtime eviction timeout')),8000)
      socket.once('disconnect',()=>{clearTimeout(timeout);resolve()})
    })
    const guest = await connect(cookie)
    let publicSocket:Socket|undefined
    let ownSocket:Socket|undefined
    try {
      assertVerdict(await roomVerdict(guest,'event:'+fixture.id),'denied','unapproved invite-only room denied')
      const rsvp=await db.rsvp.create({data:{eventId:fixture.id,userId:admin.id,name:'CI synthetic',status:'APPROVED'}})
      assertVerdict(await roomVerdict(guest,'event:'+fixture.id),'joined','approved invite-only room allowed')
      const revoked=expectEvicted(guest)
      await db.rsvp.update({where:{id:rsvp.id},data:{status:'DECLINED'}})
      await revoked
      console.log('PASS revoked invitation disconnects existing event socket')
      await db.event.update({where:{id:fixture.id},data:{visibility:'PUBLIC'}})
      publicSocket=await connect()
      assertVerdict(await roomVerdict(publicSocket,'event:'+fixture.id),'joined','published public fixture allows anonymous socket')
      const deleted=expectEvicted(publicSocket)
      await db.event.update({where:{id:fixture.id},data:{deletedAt:new Date()}})
      await deleted
      console.log('PASS deleted event disconnects existing public socket')
      ownSocket=await connect(cookie)
      assertVerdict(await roomVerdict(ownSocket,'user:'+admin.id),'joined','current session joins its notification room')
      const sessionRevoked=expectEvicted(ownSocket)
      const token=decodeURIComponent(cookie.slice('ievx_session='.length))
      const tokenHash=createHash('sha256').update(token).digest('hex')
      const changed=await db.session.updateMany({where:{tokenHash,userId:admin.id},data:{revokedAt:new Date()}})
      if(changed.count!==1)throw new Error('Expected one synthetic login session')
      await sessionRevoked
      console.log('PASS revoked session disconnects existing notification socket')
    } finally {
      guest.disconnect()
      publicSocket?.disconnect()
      ownSocket?.disconnect()
      await db.event.delete({where:{id:fixture.id}})
    }
  }

}
main().catch((error) => {
  console.error('Realtime authorization smoke FAILED:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => {
  await db.$disconnect()
})
