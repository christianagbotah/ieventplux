import { COUNTRIES } from './venue-countries'

/** Ghana's 16 administrative regions, with common city/town suggestions.
 * City is free-text so even small communities that are not prelisted are supported.
 */
export const GHANA_REGION_CITIES: Record<string, readonly string[]> = {
  'Ahafo': ['Goaso', 'Bechem', 'Mim', 'Kenyasi', 'Hwidiem'],
  'Ashanti': ['Kumasi', 'Obuasi', 'Ejisu', 'Mampong', 'Konongo', 'Bekwai', 'Offinso'],
  'Bono': ['Sunyani', 'Berekum', 'Dormaa Ahenkro', 'Wenchi', 'Nsoatre'],
  'Bono East': ['Techiman', 'Kintampo', 'Nkoranza', 'Atebubu', 'Prang'],
  'Central': ['Cape Coast', 'Kasoa', 'Winneba', 'Mankessim', 'Elmina', 'Agona Swedru'],
  'Eastern': ['Koforidua', 'Nkawkaw', 'Nsawam', 'Suhum', 'Akim Oda', 'Akosombo', 'Somanya', 'Aburi'],
  'Greater Accra': ['Accra', 'Tema', 'Madina', 'Ashaiman', 'Adenta', 'Teshie', 'Nungua', 'Dodowa', 'Dansoman', 'East Legon', 'Osu'],
  'North East': ['Nalerigu', 'Walewale', 'Gambaga', 'Bunkpurugu'],
  'Northern': ['Tamale', 'Yendi', 'Savelugu', 'Bimbilla', 'Karaga'],
  'Oti': ['Dambai', 'Nkwanta', 'Jasikan', 'Kadjebi', 'Kete Krachi', 'Chinderi'],
  'Savannah': ['Damongo', 'Bole', 'Salaga', 'Sawla', 'Daboya'],
  'Upper East': ['Bolgatanga', 'Navrongo', 'Bawku', 'Zebilla', 'Paga', 'Sandema'],
  'Upper West': ['Wa', 'Lawra', 'Jirapa', 'Tumu', 'Nadowli', 'Nandom'],
  'Volta': ['Ho', 'Hohoe', 'Keta', 'Aflao', 'Sogakope', 'Kpando', 'Anloga', 'Denu'],
  'Western': ['Sekondi-Takoradi', 'Tarkwa', 'Axim', 'Prestea', 'Shama', 'Half Assini'],
  'Western North': ['Sefwi Wiawso', 'Bibiani', 'Enchi', 'Juaboso', 'Dadieso'],
}

/** Approximate regional-capital view centers for easy navigation, never saved as venue pins. */
export const GHANA_REGION_MAP_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Ahafo': { lat: 6.80, lng: -2.52 },
  'Ashanti': { lat: 6.69, lng: -1.62 },
  'Bono': { lat: 7.34, lng: -2.33 },
  'Bono East': { lat: 7.59, lng: -1.94 },
  'Central': { lat: 5.11, lng: -1.25 },
  'Eastern': { lat: 6.09, lng: -0.26 },
  'Greater Accra': { lat: 5.60, lng: -0.19 },
  'North East': { lat: 10.53, lng: -0.37 },
  'Northern': { lat: 9.40, lng: -0.85 },
  'Oti': { lat: 8.07, lng: 0.18 },
  'Savannah': { lat: 9.08, lng: -1.82 },
  'Upper East': { lat: 10.79, lng: -0.85 },
  'Upper West': { lat: 10.06, lng: -2.50 },
  'Volta': { lat: 6.61, lng: 0.47 },
  'Western': { lat: 4.90, lng: -1.77 },
  'Western North': { lat: 6.22, lng: -2.49 },
}

export const GHANA_REGIONS = Object.keys(GHANA_REGION_CITIES).sort((a,b)=>a.localeCompare(b))
export const COUNTRY_OPTIONS = [...COUNTRIES].sort((a,b)=>a.name.localeCompare(b.name))
export const COUNTRY_NAMES = new Map(COUNTRY_OPTIONS.map(item => [item.code as string, item.name]))

export type VenuePin = { lat: number; lng: number }
export function validPin(lat: unknown, lng: unknown): VenuePin | null {
  const la = lat === '' || lat == null ? NaN : Number(lat)
  const lo = lng === '' || lng == null ? NaN : Number(lng)
  return Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180
    ? { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(lo * 1e6) / 1e6 } : null
}
export function mapsLink(pin: VenuePin): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.lat.toFixed(6)}%2C${pin.lng.toFixed(6)}`
}

/** Parse latitude/longitude from trusted full Google Maps links or plain coordinates.
 * Shortened links cannot be resolved safely on the client; the embedded map is preferred.
 */
export function parseMapsCoordinate(value: string): VenuePin | null {
  const text = value.trim()
  const raw = /^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/.exec(text)
  if (raw) return validPin(raw[1],raw[2])
  let url: URL
  try { url = new URL(text) } catch { return null }
  if (url.protocol !== 'https:' || !/^(?:www\.)?(?:google\.[a-z.]+|maps\.app\.goo\.gl)$/.test(url.hostname)) return null
  const q = url.searchParams.get('query') ?? url.searchParams.get('q') ?? ''
  const query = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(q)
  if (query) return validPin(query[1],query[2])
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname)
  return at ? validPin(at[1],at[2]) : null
}
