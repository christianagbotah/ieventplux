import { describe, expect, test } from 'bun:test'
import { publicNextOccurrence } from './reels-policy'

const publicEvent = {
  id: 'next-1', slug: 'next-show', title: 'Next show', orgId: 'org1',
  visibility: 'PUBLIC', status: 'PUBLISHED', deletedAt: null,
}

describe('Event clip privacy', () => {
  test('only surfaces a public next occurrence from the same organizer', () => {
    expect(publicNextOccurrence('org1', publicEvent)).toEqual({ id: 'next-1', slug: 'next-show', title: 'Next show' })
    expect(publicNextOccurrence('org1', { ...publicEvent, status: 'POSTPONED' })).not.toBeNull()
  })
  test('does not leak unrelated, private, draft, cancelled or deleted events', () => {
    expect(publicNextOccurrence('org2', publicEvent)).toBeNull()
    for (const visibility of ['UNLISTED', 'INVITE_ONLY']) {
      expect(publicNextOccurrence('org1', { ...publicEvent, visibility })).toBeNull()
    }
    for (const status of ['DRAFT', 'SCHEDULED', 'CANCELLED', 'ENDED']) {
      expect(publicNextOccurrence('org1', { ...publicEvent, status })).toBeNull()
    }
    expect(publicNextOccurrence('org1', { ...publicEvent, deletedAt: new Date() })).toBeNull()
    expect(publicNextOccurrence('org1', null)).toBeNull()
  })
})
