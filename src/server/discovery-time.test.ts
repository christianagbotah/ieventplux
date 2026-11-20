import { describe, expect, test } from 'bun:test'
import { discoveryCalendarWindow, localMidnightAsUtc, safeDiscoveryTimezone } from './discovery-time'
import { buildDiscoveryWhere } from './services/events'
import { supportedTicketCheckoutCurrency } from './paid-currency-policy'
import { countryLabel } from '../portal/lib/global-locations'

describe('global event discovery uses attendee-local calendars', () => {
  const iso = (value: Date) => value.toISOString()

  test('recognizes IANA timezone names and rejects invalid or giant inputs', () => {
    expect(safeDiscoveryTimezone('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(safeDiscoveryTimezone('America/New_York')).toBe('America/New_York')
    expect(safeDiscoveryTimezone('Not/A_Zone')).toBe('UTC')
    expect(safeDiscoveryTimezone('x'.repeat(1000))).toBe('UTC')
    expect(safeDiscoveryTimezone(undefined)).toBe('UTC')
  })

  test('today in Tokyo ends at the next Tokyo midnight, not Accra midnight', () => {
    const now = new Date('2026-11-20T23:30:00Z')
    const range = discoveryCalendarWindow('TODAY', 'Asia/Tokyo', now)
    expect(iso(range.gte)).toBe(now.toISOString())
    expect(iso(range.lt)).toBe('2026-11-21T15:00:00.000Z')
  })

  test('spring DST switch gives a 23-hour day in New York', () => {
    const now = new Date('2026-03-08T06:30:00Z')
    expect(iso(localMidnightAsUtc(2026, 3, 8, 'America/New_York'))).toBe('2026-03-08T05:00:00.000Z')
    expect(iso(discoveryCalendarWindow('TODAY', 'America/New_York', now).lt)).toBe('2026-03-09T04:00:00.000Z')
  })

  test('autumn DST switch gives the correct end of the 25-hour day', () => {
    const now = new Date('2026-11-01T08:30:00Z')
    expect(iso(discoveryCalendarWindow('TODAY', 'America/Los_Angeles', now).lt)).toBe('2026-11-02T08:00:00.000Z')
  })

  test('Friday weekend search begins Saturday and ends Monday', () => {
    const window = discoveryCalendarWindow('THIS_WEEKEND', 'UTC', new Date('2026-11-20T15:00:00Z'))
    expect(iso(window.gte)).toBe('2026-11-21T00:00:00.000Z')
    expect(iso(window.lt)).toBe('2026-11-23T00:00:00.000Z')
  })

  test('Sunday weekend search still includes Sunday, not next weekend', () => {
    const now = new Date('2026-11-22T12:00:00Z')
    const window = discoveryCalendarWindow('THIS_WEEKEND', 'UTC', now)
    expect(iso(window.gte)).toBe(now.toISOString())
    expect(iso(window.lt)).toBe('2026-11-23T00:00:00.000Z')
    const week = discoveryCalendarWindow('THIS_WEEK', 'UTC', now)
    expect(iso(week.lt)).toBe('2026-11-23T00:00:00.000Z')
  })

  test('search constraints combine online/hybrid events, country and local date', () => {
    const now = new Date('2026-11-20T23:30:00Z')
    const result = buildDiscoveryWhere({
      q: 'music', country: 'JP', onlineOnly: true, timezone: 'Asia/Tokyo', when: 'TODAY',
    }, now)
    expect(result.visibility).toBe('PUBLIC')
    expect(result.deletedAt).toBeNull()
    expect(result.mode).toEqual({ in: ['VIRTUAL', 'HYBRID'] })
    expect(result.country).toBe('JP')
    expect((result.startsAt as { lt: Date }).lt.toISOString()).toBe('2026-11-21T15:00:00.000Z')
    expect((result.OR as unknown[]).length).toBe(5)
  })

  test('country labels are international without assuming Ghana', () => {
    expect(countryLabel('GH')).toBe('Ghana')
    expect(countryLabel('JP')).toBe('Japan')
    expect(countryLabel('US')).toBe('United States')
    expect(countryLabel('INVALID')).toBe('INVALID')
  })
})

describe('global payment currency safety', () => {
  test('allows global free tickets but only supported paid currency', () => {
    expect(supportedTicketCheckoutCurrency(0, 'USD')).toBe(true)
    expect(supportedTicketCheckoutCurrency(0, 'JPY')).toBe(true)
    expect(supportedTicketCheckoutCurrency(1250, 'GHS')).toBe(true)
    expect(supportedTicketCheckoutCurrency(1250, 'USD')).toBe(false)
    expect(supportedTicketCheckoutCurrency(1250, 'EUR')).toBe(false)
  })

  test('refuses unsafe unit prices before money movement', () => {
    for (const price of [NaN, Infinity, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(supportedTicketCheckoutCurrency(price, 'GHS')).toBe(false)
    }
  })
})
