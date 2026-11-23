import { errors } from './api'

/** Pure, side-effect-free validation used before any stock or payment mutation.
 * A product id is an opaque CUID. The caller must still resolve it against the
 * selected event and verify the current SKU price/stock inside a transaction. */
/** Byte-stable ordering for opaque inventory keys across Node/Bun locales. */
export function compareInventoryIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
export interface SouvenirSelection { productId: string; qty: number }
export function normalizeSouvenirSelections(value: unknown): SouvenirSelection[] {
  if (!Array.isArray(value)) throw errors.badRequest('Souvenir selections must be an array.')
  if (value.length > 30) throw errors.badRequest('Maximum 30 souvenir selection rows.')
  const quantities = new Map<string, number>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !Object.prototype.hasOwnProperty.call(item, 'productId') || !Object.prototype.hasOwnProperty.call(item, 'qty')) throw errors.badRequest('Invalid souvenir selection.')
    // Reject accessor-backed values before reading untrusted checkout fields.
    // JSON requests contain own data properties, never executable getters.
    const idField = Object.getOwnPropertyDescriptor(item, 'productId')
    const qtyField = Object.getOwnPropertyDescriptor(item, 'qty')
    if (!idField || !qtyField || !('value' in idField) || !('value' in qtyField)) throw errors.badRequest('Invalid souvenir selection.')
    const productId = idField.value as unknown
    const qty = qtyField.value as unknown
    if (typeof productId !== 'string' || productId.trim() !== productId || !/^c[a-z0-9]{12,40}$/.test(productId)) throw errors.badRequest('Invalid souvenir product.')
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > 20) throw errors.badRequest('Choose 1–20 units per souvenir variant.')
    const total = (quantities.get(productId) ?? 0) + qty
    if (total > 20) throw errors.badRequest('Maximum 20 units per souvenir variant per order.')
    quantities.set(productId, total)
  }
  // Deterministic code-unit ordering across server locales avoids differing lock acquisition order.
  return [...quantities.entries()].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => compareInventoryIds(a.productId, b.productId))
}

export function souvenirLinePrice(unitPriceMinor: number, qty: number): number {
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 1 || unitPriceMinor > 2_000_000_000) throw errors.badRequest('Invalid souvenir price.')
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) throw errors.badRequest('Invalid souvenir quantity.')
  const total = unitPriceMinor * qty
  if (!Number.isSafeInteger(total) || total > 2_000_000_000) throw errors.badRequest('Souvenir order value exceeds the allowed limit.')
  return total
}

/** A catalogue preview is never a stock lock. The actual checkout must use
 * an atomic conditional UPDATE and then create an expiry-bound reservation. */
export function availableSouvenirStock(total: number, sold: number, reserved: number): number {
  if (![total, sold, reserved].every((n) => Number.isSafeInteger(n) && n >= 0)) throw errors.badRequest('Invalid souvenir stock counters.')
  // Inconsistent counters must fail closed instead of presenting a corrupt
  // catalogue snapshot as legitimate zero stock.
  if (sold > total || reserved > total - sold) throw errors.badRequest('Inconsistent souvenir stock counters.')
  return total - sold - reserved
}
