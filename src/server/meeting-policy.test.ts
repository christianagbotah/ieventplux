import { describe, expect, test } from 'bun:test'
import { canJoinMeeting, meetingEventUsable, meetingEventCallOpen, validMeetingCapacity, validMeetingSignal } from './meeting-policy'

describe('iEventPlux group meeting access', () => {
  const input = { roomStatus: 'LIVE', validEvent: true, signedIn: true, organizer: false, approvedRsvp: false, validTicket: false }
  test('only signed-in hosts or actual attendees may enter an active event meeting', () => {
    expect(canJoinMeeting(input)).toBe(false)
    expect(canJoinMeeting({ ...input, organizer: true })).toBe(true)
    expect(canJoinMeeting({ ...input, validTicket: true })).toBe(true)
    expect(canJoinMeeting({ ...input, approvedRsvp: true })).toBe(true)
    expect(canJoinMeeting({ ...input, validTicket: true, signedIn: false })).toBe(false)
    expect(canJoinMeeting({ ...input, organizer: true, roomStatus: 'ENDED' })).toBe(false)
    expect(canJoinMeeting({ ...input, validTicket: true, validEvent: false })).toBe(false)
  })
  test('does not allow cancelled, draft, deleted or suspended event content', () => {
    const evt = { status: 'PUBLISHED', deletedAt: null, org: { status: 'ACTIVE', deletedAt: null } }
    expect(meetingEventUsable(evt)).toBe(true)
    expect(meetingEventUsable({ ...evt, status: 'ENDED' })).toBe(true)
    expect(meetingEventCallOpen(evt)).toBe(true)
    expect(meetingEventCallOpen({ ...evt, status: 'ENDED' })).toBe(false)
    expect(meetingEventUsable({ ...evt, status: 'CANCELLED' })).toBe(false)
    expect(meetingEventUsable({ ...evt, org: { ...evt.org, status: 'SUSPENDED' } })).toBe(false)
    expect(meetingEventUsable({ ...evt, deletedAt: new Date() })).toBe(false)
  })
  test('mesh room deliberately limits simultaneous audio-video peers', () => {
    expect(validMeetingCapacity(2)).toBe(2)
    expect(validMeetingCapacity('6')).toBe(6)
    for (const n of [0, 1, 7, -1, 1.5, NaN, 'abc']) expect(validMeetingCapacity(n)).toBeNull()
  })
})
describe('WebRTC relay input shape', () => {
  const to = 'validSocket_02'
  test('accepts bounded ICE/SDP for authorized same-room peers', () => {
    expect(validMeetingSignal({ to, kind: 'offer', sdp: 'v=0' })).toBe(true)
    expect(validMeetingSignal({ to, kind: 'answer', sdp: 'v=0' })).toBe(true)
    expect(validMeetingSignal({ to, kind: 'candidate', candidate: { candidate: 'candidate:0 1 UDP 100 ...', sdpMLineIndex: 0 } })).toBe(true)
  })
  test('rejects unexpected operations and unbounded signaling', () => {
    for (const item of [{ to, kind: 'delete' }, { to: 'other/room', kind: 'offer', sdp: 'v=0' },
      { to, kind: 'offer', sdp: 'x'.repeat(24001) }, { to, kind: 'candidate', candidate: { candidate: 99 } },
      { to, kind: 'candidate', candidate: { candidate: 'x', sdpMLineIndex: -1 } }]) {
      expect(validMeetingSignal(item)).toBe(false)
    }
  })
})
