import { expect, test } from 'bun:test'
import { organizerEventCatalogFilters } from './organizer-meeting-catalog'

test('meetings filter eligible events before paging, excluding drafts', () => {
  expect(organizerEventCatalogFilters({ meetingEligible: true, status: 'ALL', q: null })).toEqual({
    status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] },
  })
})

test('meeting search is case insensitive, trimmed and length bounded', () => {
  expect(organizerEventCatalogFilters({ meetingEligible: true, status: null, q: '  Conference  ' })).toEqual({
    status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] },
    title: { contains: 'Conference', mode: 'insensitive' },
  })
  const longQuery = organizerEventCatalogFilters({ meetingEligible: true, status: null, q: 'a'.repeat(300) })
  expect(longQuery.title?.contains.length).toBe(120)
})

test('existing event query modes retain original status behavior', () => {
  expect(organizerEventCatalogFilters({ meetingEligible: false, status: 'DRAFT', q: 'private' })).toEqual({ status: 'DRAFT' })
  expect(organizerEventCatalogFilters({ meetingEligible: false, status: 'ALL', q: 'private' })).toEqual({})
})
