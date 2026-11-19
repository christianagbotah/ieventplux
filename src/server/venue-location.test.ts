import { describe, expect, test } from 'bun:test'
import { GHANA_REGIONS, GHANA_REGION_CITIES, COUNTRY_OPTIONS, mapsLink, parseMapsCoordinate, validPin } from '@/portal/lib/venue-locations'
import { venueCountry, venueRegion, venueCity, venueCoordinatePair, venueMapsUrl } from './venue-location'

describe('venue location selection and validation', () => {
  test('all 16 Ghana regions, including Volta and Oti, have town suggestions', () => {
    expect(GHANA_REGIONS).toHaveLength(16)
    for (const name of ['Volta', 'Oti', 'Greater Accra', 'Ashanti']) {
      expect(GHANA_REGIONS).toContain(name)
      expect(GHANA_REGION_CITIES[name].length).toBeGreaterThan(2)
    }
  })
  test('all ISO countries available, Ghana default, invalid blocked', () => {
    expect(COUNTRY_OPTIONS.length).toBe(249)
    expect(venueCountry(undefined)).toBe('GH')
    expect(venueCountry('ng')).toBe('NG')
    expect(() => venueCountry('XX')).toThrow()
  })
  test('Ghana region mandatory and validated; foreign regions can be typed', () => {
    expect(venueRegion('GH', 'Volta')).toBe('Volta')
    expect(venueRegion('GH', 'Oti')).toBe('Oti')
    expect(() => venueRegion('GH', 'Bolta')).toThrow()
    expect(() => venueRegion('GH', '')).toThrow()
    expect(venueRegion('US', 'California')).toBe('California')
    expect(venueCity('Ho')).toBe('Ho')
    expect(() => venueCity('')).toThrow()
  })
  test('coordinates must form a valid pair; zero latitude remains valid', () => {
    expect(venueCoordinatePair(null, '')).toEqual({ lat: null, lng: null })
    expect(venueCoordinatePair('0', '-0.12')).toEqual({ lat: 0, lng: -0.12 })
    expect(() => venueCoordinatePair('5.6', null)).toThrow()
    expect(() => venueCoordinatePair('91', '-0.1')).toThrow()
    expect(validPin('5.603717', '-0.186964')).toEqual({lat:5.603717,lng:-0.186964})
  })
  test('map links must point to trusted map domains', () => {
    expect(venueMapsUrl(mapsLink({lat: 6.61, lng: 0.47}))).toContain('google.com/maps')
    expect(venueMapsUrl('https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc')
    expect(() => venueMapsUrl('https://example.com/phishing')).toThrow()
    expect(() => venueMapsUrl('http://www.google.com/maps')).toThrow()
  })
  test('generated map link can be parsed back to the identical venue pin', () => {
    const pin = {lat: 6.61,lng:0.47}
    expect(parseMapsCoordinate(mapsLink(pin))).toEqual(pin)
    expect(parseMapsCoordinate('6.61,0.47')).toEqual(pin)
    expect(parseMapsCoordinate('https://www.google.com/maps/@6.61,0.47,15z')).toEqual(pin)
    expect(parseMapsCoordinate('https://not-a-map.example/?q=6.61,0.47')).toBeNull()
  })
})
