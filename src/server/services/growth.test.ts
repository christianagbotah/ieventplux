import { expect, test, describe } from 'bun:test'
import { buildGrowthIntelligence, type GrowthEventInput } from './growth'

const now = new Date('2026-11-19T10:00:00Z')
function event(partial: Partial<GrowthEventInput> = {}): GrowthEventInput {
  return { id: 'e1', title: 'Sample event', slug: 'sample', status: 'PUBLISHED', visibility: 'PUBLIC', mode: 'PHYSICAL',
    startsAt: new Date('2026-11-24T12:00:00Z'), description: 'A quality event description', summary: 'Come join us',
    coverImageUrl: '/event.jpg', venueId: 'venue1', city: 'Accra',
    ticketTypes: [{ active: true, quota: 100, soldCount: 7 }], waiting: 0, issuedLast7Days: 4, ...partial }
}
describe('Organizer growth intelligence', () => {
  test('uses actual inventory counts, never forecasts', () => {
    const result = buildGrowthIntelligence([event()], now)
    expect(result.source).toBe('rule-based')
    expect(result.ticketsIssuedLast7Days).toBe(4)
    expect(result.readyToLaunch).toBe(1)
    expect(result.opportunities.some((action) => action.evidence.includes('7 of 100'))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/expected revenue|guaranteed|prediction/i)
  })
  test('draft event guidance distinguishes readiness and publishing', () => {
    const incomplete = buildGrowthIntelligence([event({ status: 'DRAFT', coverImageUrl: null, ticketTypes: [] })], now)
    expect(incomplete.draftEvents).toBe(1)
    expect(incomplete.readyToLaunch).toBe(0)
    expect(incomplete.opportunities[0]?.title).toBe('Finish event setup')
    const complete = buildGrowthIntelligence([event({ status: 'DRAFT' })], now)
    expect(complete.opportunities[0]?.title).toBe('Ready for launch')
  })
  test('virtual events do not require a physical venue', () => {
    const result = buildGrowthIntelligence([event({ mode: 'VIRTUAL', venueId: null, city: null })], now)
    expect(result.readyToLaunch).toBe(1)
  })
  test('inactive and cancelled events never receive promotion guidance', () => {
    const result = buildGrowthIntelligence([event({ status: 'CANCELLED' }), event({ id: 'e2', status: 'ENDED' })], now)
    expect(result.opportunities).toHaveLength(0)
  })
  test('waitlist and upcoming check-in are prioritized without promise of demand', () => {
    const result = buildGrowthIntelligence([event({ waiting: 18, startsAt: new Date('2026-11-20T12:00:00Z') })], now)
    expect(result.opportunities[0]?.priority).toBe('high')
    expect(result.opportunities.some((o) => o.action === 'attendees')).toBe(true)
    expect(result.opportunities.some((o) => o.action === 'events' && o.evidence.includes('18 active'))).toBe(true)
  })
  test('no events returns useful zero-data response', () => {
    const empty = buildGrowthIntelligence([], now)
    expect(empty.actionableItems).toBe(0)
    expect(empty.ticketsIssuedLast7Days).toBe(0)
    expect(empty.generatedAt).toBe(now.toISOString())
  })
})
