import { expect, test } from 'bun:test'
import { canReadCommunity, canWriteCommunity, validReplyTarget, type CommunityEventState } from './community-policy'

const base: CommunityEventState = {
  status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null,
  org: { status: 'ACTIVE', deletedAt: null },
}
const anonymous = { organizer: false, approvedRsvp: false, validTicket: false }

test('published public discussions can be read without login, not drafts', () => {
  expect(canReadCommunity(base, anonymous)).toBe(true)
  expect(canReadCommunity({ ...base, status: 'DRAFT' }, anonymous)).toBe(false)
  expect(canReadCommunity({ ...base, visibility: 'UNLISTED' }, anonymous)).toBe(true)
})
test('private attendee community never becomes searchable through forged event ID', () => {
  const privateEvent = { ...base, visibility: 'INVITE_ONLY' }
  expect(canReadCommunity(privateEvent, anonymous)).toBe(false)
  expect(canReadCommunity(privateEvent, { ...anonymous, approvedRsvp: true })).toBe(true)
  expect(canReadCommunity(privateEvent, { ...anonymous, validTicket: true })).toBe(true)
  expect(canReadCommunity(privateEvent, { ...anonymous, organizer: true })).toBe(true)
})
test('removed events/orgs are inaccessible and cancellation is read-only', () => {
  expect(canReadCommunity({ ...base, deletedAt: new Date() }, { ...anonymous, organizer: true })).toBe(false)
  expect(canReadCommunity({ ...base, org: { status: 'SUSPENDED', deletedAt: null } }, anonymous)).toBe(false)
  expect(canWriteCommunity({ ...base, status: 'CANCELLED' }, anonymous)).toBe(false)
  expect(canReadCommunity({ ...base, status: 'CANCELLED' }, anonymous)).toBe(true)
  expect(canWriteCommunity(base, anonymous)).toBe(true)
})
test('replies require a visible root in the same event', () => {
  expect(validReplyTarget({ eventId: 'e1', status: 'VISIBLE', parentId: null }, 'e1')).toBe(true)
  expect(validReplyTarget({ eventId: 'e2', status: 'VISIBLE', parentId: null }, 'e1')).toBe(false)
  expect(validReplyTarget({ eventId: 'e1', status: 'REMOVED', parentId: null }, 'e1')).toBe(false)
  expect(validReplyTarget({ eventId: 'e1', status: 'VISIBLE', parentId: 'parent' }, 'e1')).toBe(false)
  expect(validReplyTarget(null, 'e1')).toBe(false)
})
