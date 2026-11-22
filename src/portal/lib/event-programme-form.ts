/** Client-side guidance. Server event-programme-policy is always authoritative.
 * All time values are organizer-device local times until converted for the API.
 */
export type PersonDraft = {
  name: string; role: string; startsAt: string; endsAt: string; sortOrder: string
}
export type SouvenirDraft = {
  name: string; sku: string; price: string; stockTotal: string; sortOrder: string
}

export const PROGRAMME_ROLES = [
  'HEADLINER', 'ARTIST', 'MAIN_SPEAKER', 'ASSISTANT_SPEAKER',
  'GUEST_SPEAKER', 'SPECIAL_GUEST', 'PANELIST', 'MC', 'DJ', 'HOST',
] as const

function localTimestamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) ||
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() + 1 !== Number(match[2]) ||
      date.getDate() !== Number(match[3]) ||
      date.getHours() !== Number(match[4]) ||
      date.getMinutes() !== Number(match[5])) return null
  return date.getTime()
}
function wholeNumber(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= min && n <= max
}
export function personFormError(person: PersonDraft): string | null {
  if (person.name.trim().length < 2) return 'Enter a performer or speaker name (at least two characters).'
  if (!PROGRAMME_ROLES.includes(person.role as typeof PROGRAMME_ROLES[number])) return 'Choose a valid role.'
  if (!wholeNumber(person.sortOrder, 0, 1000)) return 'Display order must be a whole number from 0 to 1,000.'
  const start = person.startsAt ? localTimestamp(person.startsAt) : null
  const end = person.endsAt ? localTimestamp(person.endsAt) : null
  if (person.startsAt && start === null) return 'Choose a valid scheduled start.'
  if (person.endsAt && end === null) return 'Choose a valid scheduled finish.'
  if (end !== null && start === null) return 'Add a scheduled start before the finish.'
  if (start !== null && end !== null && end <= start) return 'The scheduled finish must be later than the start.'
  return null
}
export function souvenirPriceMinor(input: string): number | null {
  const clean = input.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(clean)) return null
  const [whole, decimals = ''] = clean.split('.')
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > 100_000_000) return null
  return minor
}
export function souvenirFormError(product: SouvenirDraft): string | null {
  if (product.name.trim().length < 2) return 'Enter a product name (at least two characters).'
  if (!/^[A-Z0-9][A-Z0-9._-]{1,49}$/.test(product.sku.trim().toUpperCase())) {
    return 'Use a unique SKU of 2–50 letters, numbers, dots, dashes or underscores.'
  }
  if (souvenirPriceMinor(product.price) === null) return 'Enter a positive price in ₵ with up to two decimal places.'
  if (!wholeNumber(product.stockTotal, 0, 100000)) return 'Available stock must be a whole number from 0 to 100,000.'
  if (!wholeNumber(product.sortOrder, 0, 1000)) return 'Display order must be a whole number from 0 to 1,000.'
  return null
}
export function programmePdfError(file: Pick<File, 'type' | 'size'>): string | null {
  if (file.type !== 'application/pdf') return 'Choose a PDF programme file.'
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return 'Programme PDF must be larger than 0 bytes and no more than 10 MB.'
  return null
}
export function eventImageError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Select a PNG, JPEG or WebP image.'
  if (file.size === 0 || file.size > 5 * 1024 * 1024) return 'Image must be larger than 0 bytes and no more than 5 MB.'
  return null
}
