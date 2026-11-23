import { expect, test } from 'bun:test'
import {
  communityCanPost, communityUnavailableStatus, mergeCommunityThreads, mergeNetworkMembers,
  validCommunityPost, visibleEventNetwork,
} from './event-social-policy'

test('community post length constraints match API limits', () => {
  expect(validCommunityPost('H')).toBe(false)
  expect(validCommunityPost(' Hello ')).toBe(true)
  expect(validCommunityPost('x'.repeat(1001))).toBe(false)
  expect(validCommunityPost('  ')).toBe(false)
  expect(communityCanPost('LIVE')).toBe(true)
  expect(communityCanPost('CANCELLED')).toBe(false)
  expect(communityCanPost('DRAFT')).toBe(false)
})
test('private and removed discussion errors are treated as inaccessible', () => {
  expect(communityUnavailableStatus(401)).toBe(true)
  expect(communityUnavailableStatus(403)).toBe(true)
  expect(communityUnavailableStatus(404)).toBe(true)
  expect(communityUnavailableStatus(500)).toBe(false)
})
test('thread pagination does not duplicate root posts after reloads', () => {
  const a = { id: 'a' }, b = { id: 'b' }
  const previous = [a] as never[]
  const result = mergeCommunityThreads(previous, { items: [a, b], total: 2, page: 2, pageSize: 12, hasMore: false } as never, true)
  expect(result.map((item) => item.id)).toEqual(['a', 'b'])
})
test('attendee identities never display without explicit eligible consent', () => {
  const person = { id: 'u1', displayName: 'Example', following: false, isMe: false }
  const base = { items: [person], hasMore: false, nextCursor: null }
  expect(visibleEventNetwork({ ...base, eligible: false, optedIn: true })).toEqual([])
  expect(visibleEventNetwork({ ...base, eligible: true, optedIn: false })).toEqual([])
  expect(visibleEventNetwork({ ...base, eligible: true, optedIn: true })).toEqual([person])
  expect(mergeNetworkMembers([person], [person, { ...person, id: 'u2' }], true).map(p => p.id)).toEqual(['u1', 'u2'])
  expect(mergeNetworkMembers([person], [], false)).toEqual([])
})
