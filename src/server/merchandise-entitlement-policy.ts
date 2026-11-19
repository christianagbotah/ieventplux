/** Pure, deterministic collection rules. No ticket admission side effects.
 * All transitions must be called under a DB row lock and recorded with a
 * unique (entitlementId,idempotencyKey) action before commit. */
export type MerchandiseStatus = 'UNPAID' | 'READY' | 'PARTIALLY_COLLECTED' | 'COLLECTED' | 'CANCELLED' | 'REFUNDED' | 'EXCEPTION_REVIEW'
export type MerchandiseAction = 'PAYMENT_VERIFIED' | 'COLLECT' | 'CANCEL' | 'REFUND' | 'EXCEPTION'
export type MerchandiseState = { status: MerchandiseStatus; qtyPurchased: number; qtyCollected: number; qtyRefunded: number }

export function transitionMerchandise(state: MerchandiseState, action: MerchandiseAction, qty = 0): MerchandiseState {
  const { status, qtyPurchased, qtyCollected, qtyRefunded } = state
  if (![qtyPurchased, qtyCollected, qtyRefunded].every(Number.isSafeInteger) || qtyPurchased <= 0 || qtyCollected < 0 || qtyRefunded < 0 || qtyCollected + qtyRefunded > qtyPurchased) throw new Error('Invalid merchandise quantities')
  if (!Number.isSafeInteger(qty) || qty < 0) throw new Error('Invalid action quantity')
  if (action === 'PAYMENT_VERIFIED') {
    if (status !== 'UNPAID' || qty !== 0) throw new Error('Payment state transition rejected')
    return { ...state, status: 'READY' }
  }
  if (action === 'EXCEPTION') {
    if (status === 'REFUNDED' || status === 'CANCELLED' || status === 'COLLECTED' || qty !== 0) throw new Error('Cannot flag a terminal entitlement')
    return { ...state, status: 'EXCEPTION_REVIEW' }
  }
  if (action === 'COLLECT') {
    if (!['READY', 'PARTIALLY_COLLECTED'].includes(status) || qty === 0 || qty > qtyPurchased - qtyCollected - qtyRefunded) throw new Error('Collection denied: invalid state or quantity')
    const collected = qtyCollected + qty
    return { ...state, qtyCollected: collected, status: collected + qtyRefunded === qtyPurchased ? 'COLLECTED' : 'PARTIALLY_COLLECTED' }
  }
  if (action === 'CANCEL') {
    if (status !== 'UNPAID' || qty !== 0) throw new Error('Paid merchandise requires refund review, not cancellation')
    return { ...state, status: 'CANCELLED' }
  }
  if (action === 'REFUND') {
    if (!['READY', 'PARTIALLY_COLLECTED'].includes(status) || qty === 0 || qty > qtyPurchased - qtyCollected - qtyRefunded) throw new Error('Refund denied: delivered or unpaid quantity')
    const refunded = qtyRefunded + qty
    return { ...state, qtyRefunded: refunded, status: refunded + qtyCollected === qtyPurchased ? 'REFUNDED' : status }
  }
  throw new Error('Unsupported merchandise action')
}

/** No purchase flow may be enabled merely by creating the schema. */
export const MERCHANDISE_CHECKOUT_ENABLED = false as const
export const MERCHANDISE_COLLECTION_ENABLED = false as const
