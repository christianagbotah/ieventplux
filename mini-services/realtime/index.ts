import { createServer } from 'http'
import { Server } from 'socket.io'
import { mayJoinRealtimeRoom } from './realtime-auth'
import { parseRoomKey } from './room-authorization'

/**
 * iEventPlux realtime service (:3003).
 *
 * Responsibilities:
 *  - Live chat rooms per broadcast (relay; persistence + authorization happen in the
 *    Next.js API, which posts confirmed messages to /emit).
 *  - Presence/viewer counts per broadcast room.
 *  - Notification push to user rooms (posted by the API/worker via /emit).
 *
 * This service is deliberately stateless: all durable state lives in the database.
 */
const PORT = Number(process.env.REALTIME_PORT ?? 3003)
const REALTIME_SECRET = process.env.REALTIME_SECRET ?? 'dev-realtime-secret'
const PUBLIC_ORIGIN = process.env.APP_URL?.replace(/\/$/, '')
if (process.env.NODE_ENV === 'production' &&
    (REALTIME_SECRET.length < 32 || REALTIME_SECRET === 'dev-realtime-secret' || !PUBLIC_ORIGIN?.startsWith('https://'))) {
  throw new Error('Production realtime requires a unique strong REALTIME_SECRET (32+ characters) and an HTTPS APP_URL.')
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'healthy', service: 'ieventplux-realtime', rooms: roomCounts.size, connections: io.engine.clientsCount }))
    return
  }

  // Trusted ingress for backend-originated pushes (API + worker).
  if (url.pathname === '/emit' && req.method === 'POST') {
    if (req.headers['x-realtime-secret'] !== REALTIME_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'forbidden' }))
      return
    }
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as { room: string; event: string; payload: unknown }
        io.to(parsed.room).emit(parsed.event, parsed.payload)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ emitted: true, room: parsed.room }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid payload' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
})

const io = new Server(httpServer, {
  // In production the gateway forwards /socket.io/* directly to :3003.
  // Only the sandbox preview uses the allowlisted XTransformPort=3003 query.
  cors: {
    origin: process.env.NODE_ENV === 'production' ? (PUBLIC_ORIGIN || false) : true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  // Socket.IO's CORS configuration alone does not protect WebSocket upgrades.
  // Reject unexpected browser Origins before accepting handshake requests.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin
    if (process.env.NODE_ENV === 'production' && origin && origin !== PUBLIC_ORIGIN) {
      callback('Untrusted realtime origin', false)
      return
    }
    callback(null, true)
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const roomCounts = new Map<string, number>()

function bumpRoom(room: string, delta: number): number {
  const next = Math.max(0, (roomCounts.get(room) ?? 0) + delta)
  if (next === 0) roomCounts.delete(room)
  else roomCounts.set(room, next)
  return next
}

io.on('connection', (socket) => {
  let joinedRoom: string | null = null
  let joinPending = false

  socket.on('join', async (data: { room?: string }) => {
    // A guessed user or broadcast room must never receive private pushes.
    const room = data?.room
    if (joinPending || !parseRoomKey(room)) {
      socket.emit('room:denied', { code: 'INVALID_ROOM' })
      return
    }
    joinPending = true
    try {
      const allowed = await mayJoinRealtimeRoom(room, socket.handshake.headers.cookie)
      if (!socket.connected) return
      if (!allowed) {
        socket.emit('room:denied', { code: 'NOT_AUTHORIZED' })
        return
      }
      if (joinedRoom === room) return // do not inflate presence on duplicate joins
      if (joinedRoom) {
        socket.leave(joinedRoom)
        const count = bumpRoom(joinedRoom, -1)
        io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
      }
      joinedRoom = room!
      socket.join(room!)
      const count = bumpRoom(room!, 1)
      io.to(room!).emit('presence', { room: room!, viewers: count })
      socket.emit('room:joined', { room })
    } catch (error) {
      console.error('[realtime] authorization unavailable:', error instanceof Error ? error.message : 'unknown')
      socket.emit('room:denied', { code: 'AUTH_UNAVAILABLE' })
    } finally {
      joinPending = false
    }
  })

  socket.on('leave', () => {
    if (joinedRoom) {
      socket.leave(joinedRoom)
      const count = bumpRoom(joinedRoom, -1)
      io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
      joinedRoom = null
    }
  })

  // Typing indicators (ephemeral relay only).
  socket.on('typing', (data: { room?: string; user?: string }) => {
    if (!joinedRoom || !data?.user) return
    socket.to(joinedRoom).emit('typing', { user: String(data.user).slice(0, 60) })
  })

  socket.on('disconnect', () => {
    if (joinedRoom) {
      const count = bumpRoom(joinedRoom, -1)
      io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
    }
  })
})

httpServer.listen(PORT, process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`[realtime] listening on :${PORT} (socket.io path "/")`)
})
