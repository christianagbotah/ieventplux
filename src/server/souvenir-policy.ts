import { createHmac, timingSafeEqual } from 'node:crypto'
import { errors } from './api'
import { env } from './env'

/** Explicit rollout gate. Never infer readiness from NODE_ENV or the presence
 * of provider credentials. QA signoff and staging reconciliation are mandatory.
 * Do not enable this gate in production until release acceptance is recorded.
 */
export function merchandiseChargingEnabled(): boolean {
  return process.env.IEVENTPLUX_MERCH_CHECKOUT_ENABLED === 'true'
    && process.env.IEVENTPLUX_MERCH_QA_APPROVED === 'true'
}
export function merchandiseCollectionEnabled(): boolean {
  return merchandiseChargingEnabled()
    && process.env.IEVENTPLUX_MERCH_COLLECTION_QA_APPROVED === 'true'
}

/** Souvenir SKUs are priced per variant and reserved separately from tickets. */
export interface SouvenirSelection { productId: string; qty: number }
export function normalizeSouvenirLines(input: unknown): SouvenirSelection[] {
  if (!Array.isArray(input)) throw errors.badRequest('Souvenir selections must be a list.')
  if (input.length > 30) throw errors.badRequest('Maximum 30 different souvenir products per order.')
  const quantities = new Map<string, number>()
  for (const item of input) {
    if (!item || typeof item !== 'object') throw errors.badRequest('Invalid souvenir selection.')
    const productId = typeof item.productId === 'string' ? item.productId.trim() : ''
    const qty = item.qty
    if (!/^c[a-z0-9]{12,40}$/i.test(productId)) throw errors.badRequest('Choose a valid souvenir product.')
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) throw errors.badRequest('Choose 1–20 items per souvenir variant.')
    const total = (quantities.get(productId) ?? 0) + qty
    if (total > 20) throw errors.badRequest('A souvenir variant is limited to 20 units per order.')
    quantities.set(productId, total)
  }
  return [...quantities.entries()].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => a.productId.localeCompare(b.productId))
}

/** QR links are a discovery/lookup credential, never proof of payment or permission
 * to collect. The collection endpoint rechecks login, org role, paid order status
 * and remaining quantity on every request. No personal data in the QR. */
export function souvenirCollectionToken(reference: string): string {
  const sig = createHmac('sha256', `${env.appSecret}:souvenir-collection:v1`).update(reference).digest('hex').slice(0, 32)
  return `${reference}.${sig}`
}
export function verifySouvenirCollectionToken(token: string): string | null {
  if (typeof token !== 'string' || token.length > 120) return null
  const match = /^(ORD-[A-Z0-9-]{6,52})\.([a-f0-9]{32})$/i.exec(token)
  if (!match) return null
  const expected = souvenirCollectionToken(match[1]).split('.').at(-1)!
  const supplied = Buffer.from(match[2].toLowerCase(), 'hex')
  const required = Buffer.from(expected, 'hex')
  if (supplied.length !== required.length || !timingSafeEqual(supplied, required)) return null
  return match[1]
}

export function availableSouvenirStock(total: number, sold: number, reserved: number): number {
  return Math.max(0, total - sold - reserved)
}

