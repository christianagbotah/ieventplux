import { env } from '../env'

/**
 * Trusted-egress relay into the :3003 socket.io service.
 *
 * Durable state always lives in the database first — this push is best-effort.
 * If the realtime service is down, clients degrade to refetching, never to
 * silently losing data. Rooms: `broadcast:{id}`, `event:{id}`, `user:{id}`.
 */
export async function realtimeEmit(room: string, event: string, payload: unknown): Promise<void> {
  try {
    await fetch(`http://localhost:${env.realtime.port}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Realtime-Secret': env.realtime.secret },
      body: JSON.stringify({ room, event, payload }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Relay unavailable — durable state is unaffected.
  }
}
