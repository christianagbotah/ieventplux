import { describe, expect, test } from 'bun:test'
import { checkoutLinePrice, normalizeCheckoutLines, promotionHasCapacity, ticketQuotaRaised } from './checkout-policy'

describe('checkout input safety', () => {
  test('accepts distinct bounded integer quantities', () => {
    expect(normalizeCheckoutLines([{ ticketTypeId: 'vip', qty: 5 }, { ticketTypeId: 'ga', qty: 1 }])).toEqual([{ ticketTypeId: 'vip', qty: 5 }, { ticketTypeId: 'ga', qty: 1 }])
  })
  test('does not round fractional quantities or numeric strings', () => {
    for (const qty of [0, 11, 2.9, -1, '3', null, 1e30, NaN, Infinity]) {
      expect(() => normalizeCheckoutLines([{ ticketTypeId: 'a', qty }])).toThrow()
    }
  })
  test('rejects duplicated ticket types that could bypass per-buyer caps', () => {
    expect(() => normalizeCheckoutLines([{ ticketTypeId: 'vip', qty: 3 }, { ticketTypeId: 'vip', qty: 3 }])).toThrow()
    expect(() => normalizeCheckoutLines([])).toThrow()
    expect(() => normalizeCheckoutLines(Array.from({ length: 7 }, (_, i) => ({ ticketTypeId: String(i), qty: 1 })))).toThrow()
  })
  test('group discount is based on a single ticket-type line', () => {
    expect(checkoutLinePrice(2500, 4, 3, 20)).toEqual({ grossMinor: 10000, discountMinor: 2000, lineTotalMinor: 8000 })
    expect(checkoutLinePrice(2500, 2, 3, 20).discountMinor).toBe(0)
  })
  test('rejects invalid financial minor units and malformed group discounts', () => {
    for (const [unit, qty, min, pct] of [
      [NaN, 1, null, null], [Infinity, 1, null, null], [-1, 1, null, null],
      [1.2, 1, null, null], [Number.MAX_SAFE_INTEGER, 2, null, null],
      [100, 0, null, null], [100, 11, null, null],
      [100, 2, 2, null], [100, 2, null, 10],
      [100, 2, 1, 20], [100, 2, 2, 91], [100, 2, 2.5, 20],
    ] as Array<[number, number, number | null, number | null]>) {
      expect(() => checkoutLinePrice(unit, qty, min, pct)).toThrow()
    }
    expect(checkoutLinePrice(0, 1, null, null)).toEqual({ grossMinor: 0, discountMinor: 0, lineTotalMinor: 0 })
    expect(checkoutLinePrice(99999999, 10, 10, 90)).toEqual({ grossMinor: 999999990, discountMinor: 899999991, lineTotalMinor: 99999999 })
  })
  test('promotion capacity counts paid redemptions and active checkout holds', () => {
    expect(promotionHasCapacity(0, 0, 1)).toBe(true)
    expect(promotionHasCapacity(0, 1, 1)).toBe(false)
    expect(promotionHasCapacity(1, 0, 1)).toBe(false)
    expect(promotionHasCapacity(1, 1, 3)).toBe(true)
    expect(promotionHasCapacity(2, 1, 3)).toBe(false)
    expect(promotionHasCapacity(0, -1, 1)).toBe(false)
    expect(promotionHasCapacity(Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER)).toBe(false)
    expect(promotionHasCapacity(0, 0, 0)).toBe(false)
  })
  test('switching unlimited inventory to limited is not a capacity increase', () => {
    expect(ticketQuotaRaised(0, 100)).toBe(false)
    expect(ticketQuotaRaised(100, 0)).toBe(true)
    expect(ticketQuotaRaised(100, 120)).toBe(true)
    expect(ticketQuotaRaised(100, 99)).toBe(false)
  })
})
