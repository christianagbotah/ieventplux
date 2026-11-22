import { expect, test } from 'bun:test'
import { MAX_COMPARE_EVENTS, parseCompareIds, comparePath } from './public-event-compare'

test('comparison accepts at most three unique event IDs in request order', () => {
  expect(MAX_COMPARE_EVENTS).toBe(3)
  expect(parseCompareIds('event_001,event_002,event_003')).toEqual(['event_001','event_002','event_003'])
  expect(parseCompareIds('event_001')).toEqual(['event_001'])
})
test('rejects malformed, overly long and duplicative comparison queries', () => {
  for (const ids of [null, '', 'event_001,event_001', 'event_001,event_002,event_003,event_004', 'id',
    '../../private', 'event_001,anything?hack=1', 'a'.repeat(401)]) {
    expect(() => parseCompareIds(ids)).toThrow()
  }
})
test('share path is a local route and holds only vetted IDs', () => {
  expect(comparePath(['event_001','event_002'])).toBe('/compare?ids=event_001%2Cevent_002')
  expect(() => comparePath(['event_001','../../private'])).toThrow()
})
