import { describe, expect, test } from 'bun:test'
import { batchSfuIdentities, findUnauthorizedSfuParticipants, type SfuRoomEntitlements } from './meeting-sfu-guard-policy'

const state: SfuRoomEntitlements = {
  roomStatus: 'LIVE', eventOpen: true, orgOwnerId: 'owner', priced: false,
  participants: ['owner', 'manager', 'guest', 'validticket', 'banned', 'stranger'],
  hostMemberships: [{ userId: 'manager', role: 'EVENT_MANAGER' }, { userId: 'stranger', role: 'CHECKIN_STAFF' }],
  approvedRsvps: [{ userId: 'guest' }, { userId: 'banned' }],
  validTickets: [{ userId: 'validticket' }],
  bans: [{ userId: 'banned' }],
}

describe('Server-side SFU admission reconciler', () => {
  test('disconnects banned and unidentified users, not hosts or valid attendees', () => {
    expect(findUnauthorizedSfuParticipants(state)).toEqual(['banned', 'stranger'])
  })
  test('a free RSVP does not substitute for a ticket on a paid event', () => {
    expect(findUnauthorizedSfuParticipants({ ...state, priced: true })).toEqual(['guest', 'banned', 'stranger'])
  })
  test('ended, unpublished or suspended meetings lose all media connections', () => {
    expect(findUnauthorizedSfuParticipants({ ...state, roomStatus: 'ENDED' })).toEqual(state.participants)
    expect(findUnauthorizedSfuParticipants({ ...state, eventOpen: false })).toEqual(state.participants)
  })
  test('cancelled RSVP, refunded ticket and revoked organizer membership are rejected', () => {
    const revoked: SfuRoomEntitlements = {
      ...state,
      hostMemberships: [], approvedRsvps: [], validTickets: [], bans: [],
    }
    expect(findUnauthorizedSfuParticipants(revoked)).toEqual(['manager', 'guest', 'validticket', 'banned', 'stranger'])
  })
  test('scales batched data checks without a product-level attendee ceiling', () => {
    const identities = Array.from({ length: 12_345 }, (_, n) => 'user-' + n)
    const batches = batchSfuIdentities(identities, 200)
    expect(batches.length).toBe(62)
    expect(batches.flat()).toEqual(identities)
    const unlimited: SfuRoomEntitlements = { ...state, participants: identities, approvedRsvps: identities.map((userId) => ({ userId })), validTickets: [], bans: [], hostMemberships: [] }
    expect(findUnauthorizedSfuParticipants(unlimited)).toEqual([])
    expect(() => batchSfuIdentities(identities, 0)).toThrow()
  })
})
