/**
 * Small-group WebRTC room rules. P2P mesh is intentionally capped rather than
 * claiming it is suitable for webinars with hundreds of video participants.
 */
export const MEETING_MAX_PEERS = 6
export const MEETING_MAX_MESSAGE = 700

export function validMeetingCapacity(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(n) && n >= 2 && n <= MEETING_MAX_PEERS ? n : null
}

export function meetingEventUsable(event: {
  status: string; deletedAt: Date | null; org: { status: string; deletedAt: Date | null }
}): boolean {
  return !event.deletedAt && !event.org.deletedAt && event.org.status === 'ACTIVE'
    && ['PUBLISHED', 'LIVE'].includes(event.status)
}

export function canJoinMeeting(input: {
  roomStatus: string
  validEvent: boolean
  signedIn: boolean
  organizer: boolean
  approvedRsvp: boolean
  validTicket: boolean
}): boolean {
  return input.roomStatus === 'LIVE' && input.validEvent && input.signedIn
    && (input.organizer || input.approvedRsvp || input.validTicket)
}

export type MeetingSignal = {
  to: string
  kind: 'offer' | 'answer' | 'candidate'
  sdp?: string
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }
}
export function validMeetingSignal(value: unknown): value is MeetingSignal {
  if (!value || typeof value !== 'object') return false
  const signal = value as Record<string, unknown>
  if (typeof signal.to !== 'string' || !/^[A-Za-z0-9_-]{6,32}$/.test(signal.to)) return false
  if (signal.kind === 'offer' || signal.kind === 'answer') {
    return typeof signal.sdp === 'string' && signal.sdp.length > 0 && signal.sdp.length <= 24_000
  }
  if (signal.kind === 'candidate') {
    const c = signal.candidate
    if (!c || typeof c !== 'object') return false
    const ice = c as Record<string, unknown>
    return typeof ice.candidate === 'string' && ice.candidate.length <= 3000 &&
      (ice.sdpMid === undefined || ice.sdpMid === null || typeof ice.sdpMid === 'string') &&
      (ice.sdpMLineIndex === undefined || ice.sdpMLineIndex === null ||
        (typeof ice.sdpMLineIndex === 'number' && Number.isInteger(ice.sdpMLineIndex) && ice.sdpMLineIndex >= 0))
  }
  return false
}
