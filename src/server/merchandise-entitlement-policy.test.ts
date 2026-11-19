import { describe, expect, test } from 'bun:test'
import { transitionMerchandise } from './merchandise-entitlement-policy'
const unpaid = { status: 'UNPAID' as const, qtyPurchased: 3, qtyCollected: 0, qtyRefunded: 0 }
describe('Merchandise entitlement isolation and fulfilment rules', () => {
  test('payment verification is the only transition from unpaid to ready', () => {
    expect(transitionMerchandise(unpaid, 'PAYMENT_VERIFIED').status).toBe('READY')
    expect(() => transitionMerchandise(unpaid, 'COLLECT', 1)).toThrow()
  })
  test('partial pickup never claims all items and duplicate pickup is rejected', () => {
    const ready = transitionMerchandise(unpaid, 'PAYMENT_VERIFIED')
    const partial = transitionMerchandise(ready, 'COLLECT', 2)
    expect(partial.status).toBe('PARTIALLY_COLLECTED')
    expect(partial.qtyCollected).toBe(2)
    expect(() => transitionMerchandise(partial, 'COLLECT', 2)).toThrow()
    expect(transitionMerchandise(partial, 'COLLECT', 1).status).toBe('COLLECTED')
  })
  test('refund cannot consume delivered quantity', () => {
    const partial = transitionMerchandise(transitionMerchandise(unpaid, 'PAYMENT_VERIFIED'), 'COLLECT', 2)
    expect(() => transitionMerchandise(partial, 'REFUND', 2)).toThrow()
    const refunded = transitionMerchandise(partial, 'REFUND', 1)
    expect(refunded.status).toBe('REFUNDED')
    expect(refunded.qtyCollected).toBe(2)
    expect(() => transitionMerchandise(refunded, 'COLLECT', 1)).toThrow()
  })
  test('cancellation only allowed before payment and terminal states reject replay', () => {
    const cancelled = transitionMerchandise(unpaid, 'CANCEL')
    expect(() => transitionMerchandise(cancelled, 'PAYMENT_VERIFIED')).toThrow()
    expect(() => transitionMerchandise(transitionMerchandise(unpaid, 'PAYMENT_VERIFIED'), 'CANCEL')).toThrow()
  })
  test('invalid amounts and invalid status transitions are denied', () => {
    const ready = transitionMerchandise(unpaid, 'PAYMENT_VERIFIED')
    for (const n of [0, -1, 1.5, 4, Number.NaN]) expect(() => transitionMerchandise(ready, 'COLLECT', n)).toThrow()
    expect(() => transitionMerchandise({ ...ready, qtyCollected: 4 }, 'COLLECT', 1)).toThrow()
    expect(() => transitionMerchandise(ready, 'PAYMENT_VERIFIED')).toThrow()
  })
})
