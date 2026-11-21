/**
 * Probes an explicitly configured, self-hosted LiveKit SFU without touching
 * users, production rooms or stored events. Validates HTTPS room service,
 * no-limit room flag, and public WebSocket signaling through the same domain.
 */
import { randomUUID } from 'node:crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

async function main() {
  const host = process.env.MEETING_SFU_INTERNAL_HTTP_URL
  const wsUrl = process.env.MEETING_SFU_PUBLIC_WS_URL
  const key = process.env.MEETING_SFU_API_KEY
  const secret = process.env.MEETING_SFU_API_SECRET
  if (process.env.IEVENTPLUX_MEETING_MEDIA_ENGINE !== 'sfu' ||
      !host?.startsWith('http://127.0.0.1:') ||
      !wsUrl?.startsWith('wss://ieventplux.lightworldtech.com/livekit') ||
      !key || !secret || secret.length < 32) {
    throw new Error('Refusing SFU probe outside explicitly authorized loopback / same-domain staging.')
  }
  const roomName = 'ieventplux-sfu-probe-' + randomUUID()
  const service = new RoomServiceClient(host, key, secret)
  try {
    const room = await service.createRoom({ name: roomName, maxParticipants: 0, emptyTimeout: 30 })
    if (room.name !== roomName || room.maxParticipants !== 0) {
      throw new Error('SFU did not create a room with no fixed participant limit.')
    }
    console.log('PASS self-hosted SFU creates a room without a software participant cap.')
    const claims = new AccessToken(key, secret, {
      identity: 'probe-' + randomUUID(),
      name: 'Synthetic iEventPlux connection test',
      ttl: '60s',
    })
    claims.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false })
    const token = await claims.toJwt()
    const url = new URL(wsUrl.replace(/\/$/, '') + '/rtc')
    url.searchParams.set('access_token', token)
    url.searchParams.set('protocol', '15')
    url.searchParams.set('sdk', 'js')
    url.searchParams.set('version', '2.25.0')
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url.toString())
      const timer = setTimeout(() => { socket.close(); reject(new Error('SFU public WSS connection timeout')) }, 9000)
      socket.addEventListener('open', () => {
        clearTimeout(timer); socket.close(1000); resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timer); reject(new Error('LiveKit WebSocket handshake rejected'))
      }, { once: true })
    })
    console.log('PASS signed synthetic SFU WebSocket signaling through existing iEventPlux HTTPS domain.')
  } finally {
    await service.deleteRoom(roomName).catch(() => {})
  }
}

main().catch((err) => {
  console.error('SFU probe failed:', err instanceof Error ? err.message : 'unknown error')
  process.exitCode = 1
})
