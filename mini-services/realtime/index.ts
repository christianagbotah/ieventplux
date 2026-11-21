import { createServer } from 'http'
import { Server } from 'socket.io'
import { mayJoinRealtimeRoom, activeUserId } from './realtime-auth'
import { db } from '../../src/lib/db'
import { validMeetingSignal } from '../../src/server/meeting-policy'
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
        // Host-initiated removal is enforced at the relay itself. The durable
        // ban prevents the removed participant from reconnecting.
        if (parsed.event === 'meeting:remove' && ['meeting', 'meeting-chat'].includes(parseRoomKey(parsed.room)?.kind ?? '')) {
          const removedId = (parsed.payload as { userId?: unknown } | null)?.userId
          if (typeof removedId === 'string') {
            for (const peerId of io.sockets.adapter.rooms.get(parsed.room) ?? []) {
              const peer = io.sockets.sockets.get(peerId)
              if (peer?.data.meetingUserId === removedId) {
                peer.emit('meeting:removed', { message: 'The host has removed your meeting access.' })
                peer.disconnect(true)
              }
            }
          }
        }
        // Host stop must revoke ongoing signaling and clear attendance. A
        // visitor cannot continue an ended meeting using an old socket.
        if (parsed.event === 'meeting:ended' && parseRoomKey(parsed.room)?.kind === 'meeting') {
          for (const socketId of io.sockets.adapter.rooms.get(parsed.room) ?? []) {
            const peer = io.sockets.sockets.get(socketId)
            peer?.leave(parsed.room)
            peer?.emit('room:denied', { code: 'MEETING_ENDED' })
          }
          roomCounts.delete(parsed.room)
        }
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
  let meetingSignalCount = 0
  let meetingSignalWindow = Date.now()

  function notifyMeetingDeparture(room: string) {
    if (room.startsWith('meeting:')) {
      socket.to(room).emit('meeting:peer-left', { peerId: socket.id })
    }
  }

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
      // The persistent group-chat socket is independent of video admission,
      // but is still bound to the authenticated attendee for host removal.
      if (room!.startsWith('meeting-chat:')) {
        const identity = await activeUserId(socket.handshake.headers.cookie)
        if (!identity) {
          socket.emit('room:denied', { code: 'NOT_AUTHORIZED' })
          return
        }
        socket.data.meetingUserId = identity
      }
      let existingPeers: { peerId: string; name: string; userId: string }[] = []
      if (room!.startsWith('meeting:')) {
        const meeting = await db.eventMeeting.findUnique({
          where: { id: room!.slice('meeting:'.length) },
          select: { maxParticipants: true, status: true },
        })
        if (!meeting || meeting.status !== 'LIVE') {
          socket.emit('room:denied', { code: 'MEETING_NOT_LIVE' })
          return
        }
        existingPeers = [...(io.sockets.adapter.rooms.get(room!) ?? [])].map((id) => {
          const peer = io.sockets.sockets.get(id)
          return { peerId: id, name: String(peer?.data.meetingName ?? 'Participant'), userId: String(peer?.data.meetingUserId ?? '') }
        })
        if (existingPeers.length >= meeting.maxParticipants) {
          socket.emit('room:denied', { code: 'ROOM_FULL' })
          return
        }
        const identity = await activeUserId(socket.handshake.headers.cookie)
        if (!identity) {
          socket.emit('room:denied', { code: 'NOT_AUTHORIZED' })
          return
        }
        const member = await db.user.findUnique({ where: { id: identity }, select: { displayName: true } })
        socket.data.meetingName = (member?.displayName || 'Participant').slice(0, 70)
        socket.data.meetingUserId = identity
        // Recount at the final synchronous join boundary: simultaneous joins
        // must never exceed the host's published small-room capacity.
        const latest = [...(io.sockets.adapter.rooms.get(room!) ?? [])]
        if (latest.length >= meeting.maxParticipants) {
          socket.emit('room:denied', { code: 'ROOM_FULL' })
          return
        }
        existingPeers = latest.map((id) => {
          const peer = io.sockets.sockets.get(id)
          return { peerId: id, name: String(peer?.data.meetingName ?? 'Participant'), userId: String(peer?.data.meetingUserId ?? '') }
        })
      }
      if (joinedRoom) {
        notifyMeetingDeparture(joinedRoom)
        socket.leave(joinedRoom)
        const count = bumpRoom(joinedRoom, -1)
        io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
      }
      joinedRoom = room!
      socket.join(room!)
      const count = bumpRoom(room!, 1)
      io.to(room!).emit('presence', { room: room!, viewers: count })
      socket.emit('room:joined', { room })
      if (room!.startsWith('meeting:')) {
        socket.emit('meeting:peers', { peers: existingPeers, selfId: socket.id })
        socket.to(room!).emit('meeting:peer-joined', {
          peerId: socket.id, name: String(socket.data.meetingName ?? 'Participant'), userId: String(socket.data.meetingUserId ?? ''),
        })
      }
    } catch (error) {
      console.error('[realtime] authorization unavailable:', error instanceof Error ? error.message : 'unknown')
      socket.emit('room:denied', { code: 'AUTH_UNAVAILABLE' })
    } finally {
      joinPending = false
    }
  })

  socket.on('leave', () => {
    if (joinedRoom) {
      notifyMeetingDeparture(joinedRoom)
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

  // WebRTC signaling is deliberately ephemeral and scoped to socket peers who
  // have independently passed live-meeting admission. SDP/ICE never persists.
  socket.on('meeting:signal', async (signal: unknown) => {
    if (!joinedRoom?.startsWith('meeting:') || !validMeetingSignal(signal)) return
    const now = Date.now()
    if (now - meetingSignalWindow > 10_000) { meetingSignalWindow = now; meetingSignalCount = 0 }
    if (++meetingSignalCount > 100) return
    const peer = io.sockets.sockets.get(signal.to)
    if (!peer || peer.id === socket.id || !peer.rooms.has(joinedRoom)) return
    // Revalidate membership/session on relayed offers, answers and candidates.
    // Ended rooms and revoked sessions fail closed even before a reload.
    if (!await mayJoinRealtimeRoom(joinedRoom, socket.handshake.headers.cookie)) return
    peer.emit('meeting:signal', {
      from: socket.id, kind: signal.kind,
      ...(signal.kind === 'candidate'
        ? { candidate: {
          candidate: signal.candidate?.candidate,
          sdpMid: signal.candidate?.sdpMid ?? null,
          sdpMLineIndex: signal.candidate?.sdpMLineIndex ?? null,
        } }
        : { sdp: signal.sdp }),
    })
  })

  socket.on('disconnect', () => {
    if (joinedRoom) {
      notifyMeetingDeparture(joinedRoom)
      const count = bumpRoom(joinedRoom, -1)
      io.to(joinedRoom).emit('presence', { room: joinedRoom, viewers: count })
    }
  })
})

httpServer.listen(PORT, process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`[realtime] listening on :${PORT} (socket.io path "/")`)
})
