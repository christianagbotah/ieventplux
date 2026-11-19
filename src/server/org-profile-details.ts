import { ORGANIZER_TYPE_CONFIG, organizerType, type OrganizerType, type ProfileDetails } from '@/lib/organization-types'
import { errors, sanitizeText } from './api'

/** Enforce a bounded allowlist for the selected organizer category, server-side. */
export function normalizeOrganizerDetails(input: unknown, type: OrganizerType): string {
  if (input === undefined || input === null) return '{}'
  if (typeof input !== 'object' || Array.isArray(input)) throw errors.badRequest('Organizer details must be a valid object.')
  const raw = input as Record<string, unknown>
  const allowed = ORGANIZER_TYPE_CONFIG[type].fields
  const normalized: ProfileDetails = {}
  for (const field of allowed) {
    const value = raw[field.key]
    if (value === null || value === undefined || value === '') continue
    if (typeof value !== 'string' || value.length > 160) {
      throw errors.badRequest(`${field.label} must be text of up to 160 characters.`)
    }
    const cleaned = sanitizeText(value, 160)
    if (cleaned) normalized[field.key] = cleaned
  }
  return JSON.stringify(normalized)
}

/** Only category-approved keys can be reflected back to the editor. */
export function readOrganizerDetails(stored: string | null | undefined, type: string): ProfileDetails {
  const selected = organizerType(type)
  if (!stored || !selected) return {}
  let decoded: unknown
  try { decoded = JSON.parse(stored) } catch { return {} }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return {}
  const output: ProfileDetails = {}
  for (const field of ORGANIZER_TYPE_CONFIG[selected].fields) {
    const value = (decoded as Record<string, unknown>)[field.key]
    if (typeof value === 'string') output[field.key] = sanitizeText(value, 160)
  }
  return output
}

/** A business registration number is private and is never included in public profiles. */
export function publicOrganizerDetails(stored: string | null | undefined, type: string): ProfileDetails {
  const details = readOrganizerDetails(stored, type)
  delete details.registrationNumber
  return details
}
