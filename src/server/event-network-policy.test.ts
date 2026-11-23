import { expect, test } from 'bun:test'
import { eligibleForEventNetwork, eventNetworkingOpen, mayViewNetworkDirectory, validNetworkAction, NETWORK_INTEREST_KIND, publicNetworkProfile } from './event-network-policy'

const event = { status: 'PUBLISHED', deletedAt: null, org: { status: 'ACTIVE', deletedAt: null } }
const none = { organizer: false, validTicket: false, approvedRsvp: false, paidTicketRequired: false }

test('networking requires an actual entitled attendee or organizer', () => {
  expect(eligibleForEventNetwork(event, none)).toBe(false)
  expect(eligibleForEventNetwork(event, { ...none, organizer: true })).toBe(true)
  expect(eligibleForEventNetwork(event, { ...none, validTicket: true })).toBe(true)
  expect(eligibleForEventNetwork(event, { ...none, approvedRsvp: true })).toBe(true)
  expect(eligibleForEventNetwork(event, { ...none, approvedRsvp: true, paidTicketRequired: true })).toBe(false)
  expect(eligibleForEventNetwork(event, { ...none, validTicket: true, paidTicketRequired: true })).toBe(true)
})
test('cancelled, draft, removed and suspended event networking is disabled', () => {
  expect(eventNetworkingOpen({ ...event, status: 'CANCELLED' })).toBe(false)
  expect(eventNetworkingOpen({ ...event, status: 'DRAFT' })).toBe(false)
  expect(eventNetworkingOpen({ ...event, deletedAt: new Date() })).toBe(false)
  expect(eventNetworkingOpen({ ...event, org: { status: 'SUSPENDED', deletedAt: null } })).toBe(false)
  expect(eventNetworkingOpen({ ...event, status: 'ENDED' })).toBe(true)
})
test('directory is invisible until an eligible attendee explicitly opts in', () => {
  expect(mayViewNetworkDirectory({ eligible: true, optedIn: false })).toBe(false)
  expect(mayViewNetworkDirectory({ eligible: false, optedIn: true })).toBe(false)
  expect(mayViewNetworkDirectory({ eligible: true, optedIn: true })).toBe(true)
  expect(NETWORK_INTEREST_KIND).toBe('NETWORK')
})
test('only explicit join or leave actions are permitted', () => {
  expect(validNetworkAction('join')).toBe(true)
  expect(validNetworkAction('leave')).toBe(true)
  for (const value of ['follow', 'invite', 'remove', null, true, '']) expect(validNetworkAction(value)).toBe(false)
})

test('network profile projection never contains contact or private identity details', () => {
  const source = {
    id: 'test-user', displayName: 'Test Attendee', avatarUrl: null,
    email: 'never-expose@example.invalid', phone: '0000000000',
    passwordHash: 'do-not-leak', bio: 'private',
  }
  const safe = publicNetworkProfile(source, { following: false, isMe: false })
  expect(Object.keys(safe).sort()).toEqual(['avatarUrl','displayName','following','id','isMe'])
  expect(JSON.stringify(safe)).not.toContain('never-expose')
  expect(JSON.stringify(safe)).not.toContain('passwordHash')
})
