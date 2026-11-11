import { createServer } from 'http'
import { Server } from 'socket.io'

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
const PORT = 3003
const REALTIME_SECRET = process.env.REALTIME_SECRET ?? 'dev-realtime-secret'

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
  // Gateway note: clients connect with io('/?XTransformPort=3003') (relative URL,
  // port ONLY in the XTransformPort query). The engine.io path stays at its
  // default ('/socket.io/') so this service can also serve plain HTTP endpoints
  // (/health, /emit) on the same port — Caddy forwards both by query param.
  cors: { origin: '*', methods: ['GET', 'POST'] },
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

  socket.on('join', (data: { room?: string }) => {
    const room = String(data?.room ?? '')
    if (!/^[\w:-]{1,80}$/.test(room)) return
    if (joinedRoom && joinedRoom !== room) {
      socket.leave(joinedRoom)
      const count = bumpRoom(joinedRoom, -1)
      io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
    }
    joinedRoom = room
    socket.join(room)
    const count = bumpRoom(room, 1)
    io.to(room).emit('presence', { room, viewers: count })
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

httpServer.listen(PORT, () => {
  console.log(`[realtime] listening on :${PORT} (socket.io path "/")`)
})
