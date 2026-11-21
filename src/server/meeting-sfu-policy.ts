/**
 * The product does not impose a fixed participant cap in SFU mode.
 * Server resources, bandwidth, bandwidth allocation and infrastructure do.
 * "0" is LiveKit's documented no-application-limit room capacity.
 * Never silently fall back to P2P when an operator asks for SFU.
 */
export type MeetingMediaEngine = 'mesh' | 'sfu' | 'unavailable'
export interface MeetingSfuEnv {
  IEVENTPLUX_MEETING_MEDIA_ENGINE?: string
  MEETING_SFU_PUBLIC_WS_URL?: string
  MEETING_SFU_INTERNAL_HTTP_URL?: string
  MEETING_SFU_API_KEY?: string
  MEETING_SFU_API_SECRET?: string
}

export const MEETING_MESH_MAX_PARTICIPANTS = 6

export function meetingSfuConfigured(env: MeetingSfuEnv): boolean {
  const url = env.MEETING_SFU_PUBLIC_WS_URL || ''
  const internal = env.MEETING_SFU_INTERNAL_HTTP_URL || ''
  const key = env.MEETING_SFU_API_KEY || ''
  const secret = env.MEETING_SFU_API_SECRET || ''
  if (!/^wss:\/\/[^\s/@?#]+(?::\d{2,5})?(?:\/[A-Za-z0-9_-]+)?\/?$/.test(url)) return false
  if (!/^https?:\/\/[^\s/@?#]+(?::\d{2,5})?\/?$/.test(internal)) return false
  if (key.length < 8 || secret.length < 32) return false
  return true
}

export function meetingMediaEngine(env: MeetingSfuEnv): MeetingMediaEngine {
  if (env.IEVENTPLUX_MEETING_MEDIA_ENGINE !== 'sfu') return 'mesh'
  return meetingSfuConfigured(env) ? 'sfu' : 'unavailable'
}

export function validMediaCapacity(value: unknown, engine: MeetingMediaEngine): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(n)) return null
  if (engine === 'sfu') return n >= 0 && n <= 1_000_000 ? n : null
  if (engine === 'mesh') return n >= 2 && n <= MEETING_MESH_MAX_PARTICIPANTS ? n : null
  return null
}

export function meetingCapacityLabel(capacity: number, engine: MeetingMediaEngine): string {
  return engine === 'sfu' && capacity === 0 ? 'No fixed limit' : String(capacity)
}

/** Explicitly project Node ProcessEnv onto the narrow config contract. */
export function currentMeetingMediaEngine(): MeetingMediaEngine {
  return meetingMediaEngine({
    IEVENTPLUX_MEETING_MEDIA_ENGINE: process.env.IEVENTPLUX_MEETING_MEDIA_ENGINE,
    MEETING_SFU_PUBLIC_WS_URL: process.env.MEETING_SFU_PUBLIC_WS_URL,
    MEETING_SFU_INTERNAL_HTTP_URL: process.env.MEETING_SFU_INTERNAL_HTTP_URL,
    MEETING_SFU_API_KEY: process.env.MEETING_SFU_API_KEY,
    MEETING_SFU_API_SECRET: process.env.MEETING_SFU_API_SECRET,
  })
}
