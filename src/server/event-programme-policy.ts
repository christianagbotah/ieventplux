/** Event lineup and souvenir catalog rules. All public-facing programme details
 * come from organizer-provided facts. No speakers, appearances, products or
 * merchandise availability may be inferred by a generative model. */
import { errors, sanitizeText } from './api'

export const CONTRIBUTOR_ROLES = [
  'ARTIST', 'HEADLINER', 'MAIN_SPEAKER', 'ASSISTANT_SPEAKER',
  'GUEST_SPEAKER', 'PANELIST', 'MC', 'DJ', 'HOST', 'SPECIAL_GUEST',
] as const

function optionalDate(value: unknown, name: string): Date | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' && !(value instanceof Date)) throw errors.badRequest(`${name} must be a date and time.`)
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) throw errors.badRequest(`${name} must be a valid date and time.`)
  return d
}
function whole(value: unknown, name: string, min: number, max: number): number {
  if (value === '' || value === undefined || value === null || typeof value === 'boolean') throw errors.badRequest(`${name} is required.`)
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < min || n > max) throw errors.badRequest(`${name} must be a whole number between ${min} and ${max}.`)
  return n
}
export function contributorPayload(input: Record<string, unknown>) {
  const name = sanitizeText(input.name, 120)
  if (name.length < 2) throw errors.badRequest('Enter the performer or speaker name (at least two characters).')
  const role = String(input.role || 'GUEST_SPEAKER').trim().toUpperCase()
  if (!(CONTRIBUTOR_ROLES as readonly string[]).includes(role)) throw errors.badRequest('Choose a valid speaker or performer role.')
  const startsAt = optionalDate(input.startsAt, 'Scheduled start')
  const endsAt = optionalDate(input.endsAt, 'Scheduled finish')
  if (endsAt && !startsAt) throw errors.badRequest('Set a start time before the finish time.')
  if (startsAt && endsAt && endsAt <= startsAt) throw errors.badRequest('Finish time must be after the start time.')
  const photoUrl = sanitizeText(input.photoUrl, 400) || null
  if (photoUrl && !/^\/uploads\/[a-f\d-]+\.(jpg|png|webp)$|^https:\/\/[a-z\d.-]+(?:\/[^\s]*)?$/i.test(photoUrl)) {
    throw errors.badRequest('Provide an uploaded image or a secure HTTPS image URL.')
  }
  return {
    name, role, topic: sanitizeText(input.topic, 240) || null,
    bio: sanitizeText(input.bio, 1600) || null, photoUrl,
    startsAt, endsAt,
    sortOrder: input.sortOrder === undefined ? 0 : whole(input.sortOrder, 'Display order', 0, 1000),
    published: input.published === undefined ? true : input.published === true,
  }
}

export function souvenirPayload(input: Record<string, unknown>, previous?: {
  priceMinor: number; stockTotal: number; stockReserved: number; stockSold: number
}) {
  const name = sanitizeText(input.name, 120)
  if (name.length < 2) throw errors.badRequest('A souvenir must have a name.')
  const sku = sanitizeText(input.sku, 50).toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9._-]{1,49}$/.test(sku)) throw errors.badRequest('SKU must contain 2–50 letters, numbers, dots, dashes or underscores.')
  const priceMinor = input.priceMinor === undefined && previous ? previous.priceMinor : whole(input.priceMinor, 'Souvenir price (pesewas)', 1, 100_000_000)
  if (previous && previous.stockSold > 0 && priceMinor !== previous.priceMinor) throw errors.conflict('Price cannot change after sales; create a new variant instead.')
  const stockTotal = input.stockTotal === undefined && previous ? previous.stockTotal : whole(input.stockTotal, 'Stock quantity', 0, 100_000)
  if (previous && stockTotal < previous.stockSold + previous.stockReserved) throw errors.conflict('Stock cannot be reduced below existing sold and reserved quantities.')
  const imageUrl = sanitizeText(input.imageUrl, 400) || null
  if (imageUrl && !/^\/uploads\/[a-f\d-]+\.(jpg|png|webp)$|^https:\/\/[a-z\d.-]+(?:\/[^\s]*)?$/i.test(imageUrl)) {
    throw errors.badRequest('Provide an uploaded image or a secure HTTPS image URL.')
  }
  return {
    name, sku, priceMinor, stockTotal,
    variantLabel: sanitizeText(input.variantLabel, 80) || null,
    description: sanitizeText(input.description, 1000) || null,
    imageUrl,
    active: input.active === undefined ? true : input.active === true,
    sortOrder: input.sortOrder === undefined ? 0 : whole(input.sortOrder, 'Display order', 0, 1000),
  }
}
