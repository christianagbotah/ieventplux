import { createHmac, timingSafeEqual } from 'node:crypto'
import { errors } from './api'
import { env } from './env'
import { normalizeSouvenirSelections } from './souvenir-checkout-policy'
// Single fail-closed stock-counter policy shared by checkout and collection code.
export { availableSouvenirStock } from './souvenir-checkout-policy'

export type SouvenirSelection = { productId: string; qty: number }
/** One canonical validation and lock ordering path for all checkout callers.
 * Never trim an opaque product ID: a changed identifier must be rejected,
 * not silently redirected to a different inventory record. */
export const normalizeSouvenirLines = normalizeSouvenirSelections

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
