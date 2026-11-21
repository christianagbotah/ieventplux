import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { currentMeetingMediaEngine } from './meeting-sfu-policy'

type Settings = {
  publicUrl: string
  internalUrl: string
  key: string
  secret: string
}

export function configuredMeetingSfu(): Settings | null {
  if (currentMeetingMediaEngine() !== 'sfu') return null
  return {
    publicUrl: process.env.MEETING_SFU_PUBLIC_WS_URL!,
    internalUrl: process.env.MEETING_SFU_INTERNAL_HTTP_URL!,
    key: process.env.MEETING_SFU_API_KEY!,
    secret: process.env.MEETING_SFU_API_SECRET!,
  }
}

export function meetingSfuRoomName(meetingId: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(meetingId)) throw new Error('Invalid event meeting identifier.')
  return 'ieventplux-meeting-' + meetingId
}

export async function createMeetingSfuToken(
  meetingId: string,
  user: { id: string; displayName: string },
): Promise<{ token: string; serverUrl: string }> {
  const config = configuredMeetingSfu()
  if (!config) throw new Error('SFU not configured.')
  const access = new AccessToken(config.key, config.secret, {
    identity: user.id,
    name: user.displayName.slice(0, 90),
    ttl: '60s',
  })
  access.addGrant({
    room: meetingSfuRoomName(meetingId),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false, // Durable group chat uses our own authorized API
  })
  return { token: await access.toJwt(), serverUrl: config.publicUrl }
}

function roomClient(): RoomServiceClient | null {
  const config = configuredMeetingSfu()
  if (!config) return null
  return new RoomServiceClient(config.internalUrl, config.key, config.secret)
}

/**
 * Host moderation must eject media in addition to the existing Socket.IO chat
 * rooms. A client refusing to process a 'meeting:remove' event still loses SFU
 * media access. Self-hosted LiveKit lacks Cloud token revocation: newly issued
 * 60-second room JWTs are short-lived, and API authorization refuses banned users.
 */
export async function evictMeetingSfuParticipant(meetingId: string, userId: string): Promise<void> {
  const client = roomClient()
  if (!client) return
  try {
    await client.removeParticipant(meetingSfuRoomName(meetingId), userId)
  } catch (error) {
    // The user may not be in the media room; no media session exists to revoke.
    const message = String(error instanceof Error ? error.message : error)
    if (/not found|does not exist|participant not connected/i.test(message)) return
    throw error
  }
}

/** A host ending a meeting must terminate the SFU room, not just its API state. */
export async function closeMeetingSfuRoom(meetingId: string): Promise<void> {
  const client = roomClient()
  if (!client) return
  try {
    await client.deleteRoom(meetingSfuRoomName(meetingId))
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    if (/not found|does not exist|room not found/i.test(message)) return
    throw error
  }
}
