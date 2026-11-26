/** Compiled realtime smoke against a disposable PostgreSQL fixture. */
import { createHash, randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import { db } from '../src/lib/db'

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid')
if (process.env.CI !== 'true' || process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes' ||
    !['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '5432' ||
    url.pathname !== '/ieventplux_realtime_ci') throw new Error('Disposable realtime package DB required.')
const endpoint = 'http://127.0.0.1:3103'
const suffix = randomUUID()
const sockets: Socket[] = []
let userId: string | undefined
let orgId: string | undefined
let eventId: string | undefined
function check(value: unknown, message: string) {
  if (!value) throw new Error(message)
  console.log('PASS ' + message)
}
async function connect(cookie?: string) {
  const socket = io(endpoint, { autoConnect:false, transports:['websocket'], reconnection:false, timeout:5000, extraHeaders:cookie?{Cookie:cookie}:undefined })
  sockets.push(socket)
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Socket connection timeout')),6000)
    socket.once('connect',()=>{clearTimeout(timer);resolve()})
    socket.once('connect_error',error=>{clearTimeout(timer);reject(error)})
    socket.connect()
  })
  return socket
}
async function verdict(socket:Socket, room:string) {
  return new Promise<string>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Room verdict timeout')),6000)
    function done(value:string){clearTimeout(timer);socket.off('room:joined',joined);socket.off('room:denied',denied);resolve(value)}
    function joined(){done('joined')}
    function denied(){done('denied')}
    socket.once('room:joined',joined)
    socket.once('room:denied',denied)
    socket.emit('join',{room})
  })
}
try {
  const user=await db.user.create({data:{email:'ci-'+suffix+'@example.invalid',passwordHash:'unused-synthetic',displayName:'CI runtime fixture'}})
  userId=user.id
  const org=await db.organization.create({data:{name:'CI runtime fixture',slug:'ci-'+suffix,ownerId:user.id,status:'ACTIVE'}})
  orgId=org.id
  const event=await db.event.create({data:{orgId:org.id,title:'CI runtime fixture',slug:'ci-'+suffix,description:'Synthetic CI only.',categorySlug:'community',visibility:'PUBLIC',status:'PUBLISHED',startsAt:new Date(Date.now()+86400000),endsAt:new Date(Date.now()+90000000)}})
  eventId=event.id
  const token=randomUUID()
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+60000)}})
  const guest=await connect()
  check(await verdict(guest,'user:'+user.id)==='denied','compiled relay denies anonymous private room')
  check(await verdict(guest,'event:'+event.id)==='joined','compiled relay allows published public room')
  const own=await connect('ievx_session='+token)
  check(await verdict(own,'user:'+user.id)==='joined','compiled relay resolves real session and own room')
  console.log('REALTIME_RUNTIME_SOCKET_SMOKE_PASSED')
} finally {
  for(const socket of sockets)socket.disconnect()
  if(eventId)await db.event.delete({where:{id:eventId}})
  if(orgId)await db.organization.delete({where:{id:orgId}})
  if(userId)await db.user.delete({where:{id:userId}})
  await db.$disconnect()
}
