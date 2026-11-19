import { errors, sanitizeText } from './api'
import { GHANA_REGIONS, COUNTRY_OPTIONS, validPin } from '@/portal/lib/venue-locations'

const countryCodes = new Set<string>(COUNTRY_OPTIONS.map((item) => item.code))

/** Strict validation for reusable venue location records; geographic boundaries are not inferred from a map pin. */
export function venueCountry(value: unknown): string {
  const country = sanitizeText(value, 2).toUpperCase() || 'GH'
  if (!countryCodes.has(country)) throw errors.badRequest('Select a supported country from the country list.')
  return country
}

export function venueRegion(country: string, value: unknown): string | null {
  const region = sanitizeText(value, 60)
  if (country === 'GH' && !region) throw errors.badRequest('Select one of Ghana’s 16 regions.')
  if (country === 'GH' && !GHANA_REGIONS.includes(region)) throw errors.badRequest('Choose a valid Ghanaian region from the list (including Volta or Oti).')
  return region || null
}

export function venueCity(value: unknown): string {
  const city = sanitizeText(value, 60)
  if (city.length < 2) throw errors.badRequest('Enter the city or town where this venue is located.')
  return city
}

export function venueCoordinatePair(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
  if (empty(lat) && empty(lng)) return { lat: null, lng: null }
  if (empty(lat) || empty(lng)) throw errors.badRequest('Both map coordinates are required. Select the venue on the map again.')
  const position = validPin(lat, lng)
  if (!position) throw errors.badRequest('The map coordinates are invalid. Select a valid point on the map.')
  return position
}

/** Block arbitrary third-party URLs from being presented as "map" directions. */
export function venueMapsUrl(value: unknown): string | null {
  const raw = sanitizeText(value, 300)
  if (!raw) return null
  let url: URL
  try { url = new URL(raw) } catch { throw errors.badRequest('Enter a valid HTTPS map link.') }
  const allowed = new Set([
    'google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl',
    'maps.apple.com', 'openstreetmap.org', 'www.openstreetmap.org',
  ])
  if (url.protocol !== 'https:' || !allowed.has(url.hostname.toLowerCase()) || url.username || url.password) {
    throw errors.badRequest('Use a Google Maps, Apple Maps or OpenStreetMap HTTPS link for venue directions.')
  }
  return url.toString()
}
