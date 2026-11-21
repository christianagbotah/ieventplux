import { createHmac, timingSafeEqual } from 'node:crypto'
import { errors } from './api'
import { env } from './env'
// Single fail-closed stock-counter policy shared by checkout and collection code.
export { availableSouvenirStock } from './souvenir-checkout-policy'

export type SouvenirSelection = { productId: string; qty: number }
export function normalizeSouvenirLines(value: unknown): SouvenirSelection[] {
  if (!Array.isArray(value)) throw errors.badRequest('Souvenir lines must be a list.')
  if (value.length > 30) throw errors.badRequest('Maximum 30 souvenir lines per order.')
  const grouped = new Map<string, number>()
  for (const row of value) {
    if (!row || typeof row !== 'object') throw errors.badRequest('Invalid souvenir line.')
    const productId = typeof row.productId === 'string' ? row.productId.trim() : ''
    const qty = row.qty
    if (!/^c[a-z0-9]{12,40}$/i.test(productId)) throw errors.badRequest('Invalid souvenir product.')
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) throw errors.badRequest('Select 1–20 of any souvenir.')
    const total = (grouped.get(productId) ?? 0) + qty
    if (total > 20) throw errors.badRequest('Maximum 20 of one souvenir per order.')
    grouped.set(productId, total)
  }
  return [...grouped.entries()].map(([productId, qty]) => ({ productId, qty })).sort((a,b) => a.productId.localeCompare(b.productId))
}

export function souvenirCollectionToken(reference: string): string {
  const signature = createHmac('sha256', `${env.appSecret}:souvenir-collection:v1`).update(reference).digest('hex').slice(0, 32)
  return `${reference}.${signature}`
}
export function verifySouvenirCollectionToken(token: string): string | null {
  if (typeof token !== 'string' || token.length > 120) return null
  const match = /^(ORD-[A-Z0-9-]{6,52})\.([a-f0-9]{32})$/i.exec(token)
  if (!match) return null
  const target = Buffer.from(souvenirCollectionToken(match[1]).split('.').at(-1)!, 'hex')
  const supplied = Buffer.from(match[2], 'hex')
  return supplied.length === target.length && timingSafeEqual(target, supplied) ? match[1] : null
}
/** Explicit launch control: keep commerce closed until DB migration, sandbox
 * payment and collection QA, and finance review are all verified. */
export function souvenirCheckoutEnabled(): boolean {
  return process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED === '1'
}

/** Physical handover requires its own post-QA activation, independent of checkout. */
export function souvenirCollectionEnabled(): boolean {
  return process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED === '1' && souvenirCheckoutEnabled()
}
