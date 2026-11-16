import { errors, sanitizeText } from '@/server/api'

/** Validate and normalize externally visible organization metadata. */
export const SOCIAL_KEYS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'whatsapp'] as const
type SocialKey = typeof SOCIAL_KEYS[number]
const socialHosts: Record<SocialKey, readonly string[]> = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'], instagram: ['instagram.com'], tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'], whatsapp: ['wa.me', 'whatsapp.com'],
}
export function safeHttps(value: unknown, label: string, maxLength = 500): string | null {
  const raw = sanitizeText(value, maxLength + 1).trim()
  if (!raw) return null
  if (raw.length > maxLength) throw errors.badRequest(label + ' is too long.')
  const candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw new Error('invalid')
    return url.toString()
  } catch {
    throw errors.badRequest('Enter a valid HTTPS URL for ' + label + '.')
  }
}
function coordinate(value: unknown, label: string, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw errors.badRequest(label + ' must be between ' + minimum + ' and ' + maximum + '.')
  return Math.round(number * 1_000_000) / 1_000_000
}
export function organizationFields(body: Record<string, unknown>): Record<string, string | number | null> {
  const data: Record<string, string | number | null> = {}
  if (body.address !== undefined) data.address = sanitizeText(body.address, 300) || null
  if (body.contactEmail !== undefined) {
    const email = sanitizeText(body.contactEmail, 160).trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw errors.badRequest('Enter a valid organization contact email.')
    data.contactEmail = email || null
  }
  if (body.website !== undefined) data.website = safeHttps(body.website, 'website', 200)
  if (body.mapsUrl !== undefined) {
    const url = safeHttps(body.mapsUrl, 'Google Maps location')
    if (url) {
      const hostname = new URL(url).hostname.toLowerCase()
      if (!['google.com', 'maps.app.goo.gl', 'goo.gl'].some((host) => hostname === host || hostname.endsWith('.' + host))) {
        throw errors.badRequest('Use a Google Maps share link.')
      }
    }
    data.mapsUrl = url
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
    data.latitude = coordinate(body.latitude, 'Latitude', -90, 90)
    data.longitude = coordinate(body.longitude, 'Longitude', -180, 180)
    if ((data.latitude === null) !== (data.longitude === null)) throw errors.badRequest('Provide latitude and longitude together.')
  }
  if (body.socialLinks !== undefined) {
    if (!body.socialLinks || typeof body.socialLinks !== 'object' || Array.isArray(body.socialLinks)) throw errors.badRequest('Invalid social media links.')
    const links: Partial<Record<SocialKey, string>> = {}
    for (const key of SOCIAL_KEYS) {
      const value = (body.socialLinks as Record<string, unknown>)[key]
      if (value === undefined || value === null || String(value).trim() === '') continue
      const raw = sanitizeText(value, 250).trim()
      let url: string
      if (/^https?:\/\//i.test(raw)) {
        url = safeHttps(raw, key, 250)!
      } else if (key === 'whatsapp' && /^\+?[\d\s-]{8,22}$/.test(raw)) {
        url = 'https://wa.me/' + raw.replace(/\D/g, '')
      } else if (/^@?[a-zA-Z0-9._-]{2,70}$/.test(raw)) {
        const user = raw.replace(/^@/, '')
        const domain = key === 'x' ? 'x.com' : key === 'youtube' ? 'youtube.com' : key + '.com'
        url = 'https://' + domain + '/' + (key === 'youtube' || key === 'tiktok' ? '@' : '') + user
      } else {
        throw errors.badRequest('Enter a ' + key + ' profile link or handle.')
      }
      const hostname = new URL(url).hostname.toLowerCase()
      if (!socialHosts[key].some((host) => hostname === host || hostname.endsWith('.' + host))) throw errors.badRequest('The ' + key + ' link points to the wrong platform.')
      links[key] = url
    }
    data.socialLinks = JSON.stringify(links)
  }
  return data
}
