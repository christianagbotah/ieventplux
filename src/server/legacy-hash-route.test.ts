import { expect, test } from 'bun:test'
import { legacyHashLocation } from './legacy-hash-route'

test('direct organizer meeting links preserve their tab', () => {
  expect(legacyHashLocation(['organizer'], { tab: 'meetings' })).toBe('/#/organizer?tab=meetings')
})

test('meeting, event and invitation deep links become existing client-side routes', () => {
  expect(legacyHashLocation(['meeting', 'abc_123'], {})).toBe('/#/meeting/abc_123')
  expect(legacyHashLocation(['event', 'summer concert'], { src: 'friend' })).toBe('/#/event/summer%20concert?src=friend')
  expect(legacyHashLocation(['invite', 'test'], { meeting: 'm1', source: ['sms', 'email'] })).toBe('/#/invite/test?meeting=m1&source=sms&source=email')
})

test('shared event comparison clean links preserve validated query text for the client', () => {
  expect(legacyHashLocation(['compare'], { ids: 'event_001,event_002' }))
    .toBe('/#/compare?ids=event_001%2Cevent_002')
})

test('unexpected or sensitive server paths remain 404 rather than leaking into SPA', () => {
  expect(legacyHashLocation(['api', 'v1'], {})).toBeNull()
  expect(legacyHashLocation(['uploads', 'secret.pdf'], {})).toBeNull()
  expect(legacyHashLocation(['unknown'], {})).toBeNull()
  expect(legacyHashLocation(['meeting', 'a', 'b'], {})).toBeNull()
  expect(legacyHashLocation(['meeting'], {})).toBeNull()
})

test('redirects are always rooted on the local site and bounded', () => {
  expect(legacyHashLocation(['meeting', '//evil.example'], {})).toBe('/#/meeting/%2F%2Fevil.example')
  expect(legacyHashLocation(['meeting', 'x'.repeat(201)], {})).toBeNull()
  expect(legacyHashLocation(['me'], { tab: 'profile', bad: 'x'.repeat(2000) })).toBe('/#/me?tab=profile')
})
