import { describe, expect, test } from 'bun:test'
import { canJoinMeeting, meetingEventUsable, meetingEventCallOpen, validMeetingCapacity, validMeetingSignal, validMeetingScreenUpdate } from './meeting-policy'

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
  test('priced events cannot be entered using only an approved RSVP or generic guest invitation', () => {
    expect(canJoinMeeting({ ...input, approvedRsvp: true, hasPaidTicketType: true })).toBe(false)
    expect(canJoinMeeting({ ...input, approvedRsvp: true, hasPaidTicketType: true, validTicket: true })).toBe(true)
    expect(canJoinMeeting({ ...input, organizer: true, hasPaidTicketType: true })).toBe(true)
    expect(canJoinMeeting({ ...input, approvedRsvp: true, hasPaidTicketType: false })).toBe(true)
    expect(canJoinMeeting({ ...input, approvedRsvp: false, hasPaidTicketType: true })).toBe(false)
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

describe('Authorized presenter signaling shape', () => {
  test('screen updates require a boolean and no forged data fields', () => {
    expect(validMeetingScreenUpdate({ sharing: true })).toBe(true)
    expect(validMeetingScreenUpdate({ sharing: false })).toBe(true)
    for (const value of [null, {}, [], 'true', { sharing: 1 },
      { sharing: 'yes' }, { sharing: true, peerId: 'forged' }, { sharing: true, userId: 'other' }]) {
      expect(validMeetingScreenUpdate(value)).toBe(false)
    }
  })
})
