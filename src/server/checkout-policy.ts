import { errors } from './api'

export interface CheckoutLine { ticketTypeId: string; qty: number }

/** Refuse duplicated and fractional line items *before* touching inventory.
 * Every quantity must be a real integer, not rounded or coerced downwards.
 */
export function normalizeCheckoutLines(items: unknown): CheckoutLine[] {
  if (!Array.isArray(items) || items.length === 0) throw errors.badRequest('Select at least one ticket type.')
  if (items.length > 6) throw errors.badRequest('You can select at most six different ticket types.')
  const seen = new Set<string>()
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw errors.badRequest('A ticket selection is invalid.')
    const value = item as Record<string, unknown>
    const ticketTypeId = value.ticketTypeId
    const qty = value.qty
    if (typeof ticketTypeId !== 'string' || !ticketTypeId.trim() || ticketTypeId.length > 100) throw errors.badRequest('A ticket type was not selected.')
    if (seen.has(ticketTypeId)) throw errors.badRequest('Each ticket type can appear only once in an order. Adjust its quantity instead.')
    seen.add(ticketTypeId)
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > 10) throw errors.badRequest('Quantity must be a whole number between 1 and 10 per ticket type.')
    return { ticketTypeId, qty }
  })
}

/** Both quantities and price are integer minor units; a line discount is
 * snapshotted to the order, not recomputed after organizer policy changes.
 */
export function checkoutLinePrice(unitMinor: number, qty: number, groupMinQty: number | null, groupPctOff: number | null) {
  // Never persist an imprecise financial snapshot if a corrupted catalog row
  // or untrusted caller supplies values outside the minor-unit contract.
  if (!Number.isSafeInteger(unitMinor) || unitMinor < 0 || !Number.isSafeInteger(qty) || qty < 1 || qty > 10 ||
      !Number.isSafeInteger(unitMinor * qty) ||
      (groupMinQty !== null && (!Number.isSafeInteger(groupMinQty) || groupMinQty < 2 || groupMinQty > 10)) ||
      (groupPctOff !== null && (!Number.isSafeInteger(groupPctOff) || groupPctOff < 1 || groupPctOff > 90)) ||
      (groupMinQty === null) !== (groupPctOff === null)) {
    throw errors.badRequest('Ticket pricing or group discount configuration is invalid. Refresh checkout.')
  }
  const grossMinor = unitMinor * qty
  const discountMinor = groupMinQty && groupPctOff && qty >= groupMinQty ? Math.round((grossMinor * groupPctOff) / 100) : 0
  return { grossMinor, discountMinor, lineTotalMinor: grossMinor - discountMinor }
}

export function ticketQuotaRaised(previous: number, next: number): boolean {
  return previous > 0 && next === 0 || previous > 0 && next > previous
}

/** Count confirmed uses plus currently held checkouts; stale holds do not
 * permanently consume a promotion. Caller serializes this check via PG row lock.
 */
export function promotionHasCapacity(usedCount: number, pendingReservations: number, maxUses: number): boolean {
  return Number.isSafeInteger(usedCount) && Number.isSafeInteger(pendingReservations) &&
    Number.isSafeInteger(maxUses) && usedCount >= 0 && pendingReservations >= 0 &&
    maxUses > 0 && Number.isSafeInteger(usedCount + pendingReservations) &&
    usedCount + pendingReservations < maxUses
}
