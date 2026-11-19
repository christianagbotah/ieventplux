import { describe, expect, test } from 'bun:test'
import { checkoutLinePrice, normalizeCheckoutLines, ticketQuotaRaised } from './checkout-policy'

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
  test('switching unlimited inventory to limited is not a capacity increase', () => {
    expect(ticketQuotaRaised(0, 100)).toBe(false)
    expect(ticketQuotaRaised(100, 0)).toBe(true)
    expect(ticketQuotaRaised(100, 120)).toBe(true)
    expect(ticketQuotaRaised(100, 99)).toBe(false)
  })
})
