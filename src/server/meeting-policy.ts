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
    && ['PUBLISHED', 'LIVE', 'ENDED'].includes(event.status)
}

/** Group chat survives an event ending, but new audio/video calls may not. */
export function meetingEventCallOpen(event: { status: string }): boolean {
  return event.status === 'PUBLISHED' || event.status === 'LIVE'
}

export function canJoinMeeting(input: {
  roomStatus: string
  validEvent: boolean
  signedIn: boolean
  organizer: boolean
  approvedRsvp: boolean
  validTicket: boolean
  /** Any priced ticket type makes this a ticket-gated meeting. */
  hasPaidTicketType?: boolean
}): boolean {
  return input.roomStatus === 'LIVE' && input.validEvent && input.signedIn
    && (input.organizer || input.validTicket || (input.approvedRsvp && !input.hasPaidTicketType))
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
    return typeof ice.candidate === 'string' && ice.candidate.length > 0 && ice.candidate.length <= 3000 &&
      (ice.sdpMid === undefined || ice.sdpMid === null || (typeof ice.sdpMid === 'string' && ice.sdpMid.length <= 64)) &&
      (ice.sdpMLineIndex === undefined || ice.sdpMLineIndex === null ||
        (typeof ice.sdpMLineIndex === 'number' && Number.isInteger(ice.sdpMLineIndex) && ice.sdpMLineIndex >= 0))
  }
  return false
}

/** Browser screen-share status is an ephemeral presentation hint, not a media
 * permission or authorization token. Reject malformed signaling inputs. */
export function validMeetingScreenUpdate(value: unknown): value is { sharing: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const fields = Object.keys(value)
  return fields.length === 1 && fields[0] === 'sharing' &&
    typeof (value as { sharing: unknown }).sharing === 'boolean'
}
