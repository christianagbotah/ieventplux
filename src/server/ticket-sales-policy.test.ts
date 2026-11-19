import { describe, expect, test } from 'bun:test'
import { boundedInt, ticketSalesSettings } from './ticket-sales-policy'

describe('ticket sales policy', () => {
  test('accepts an early-bird window and group discount when affordable and buyable', () => {
    const result = ticketSalesSettings({ perBuyerLimit: 6, saleStartsAt: '2026-12-01T08:00:00.000Z', saleEndsAt: '2026-12-08T19:00:00.000Z', groupMinQty: 4, groupPctOff: 15 }, undefined, 2500)
    expect(result.groupMinQty).toBe(4)
    expect(result.groupPctOff).toBe(15)
    expect(result.saleEndsAt!.getTime()).toBeGreaterThan(result.saleStartsAt!.getTime())
  })
  test('rejects reversed dates and invalid timestamps', () => {
    expect(() => ticketSalesSettings({ saleStartsAt: '2026-12-08', saleEndsAt: '2026-12-01' })).toThrow()
    expect(() => ticketSalesSettings({ saleStartsAt: 'not-a-date' })).toThrow()
  })
  test('rejects missing group pair, invalid discounts, too-large groups and free group discounts', () => {
    expect(() => ticketSalesSettings({ groupMinQty: 3 }, undefined, 4000)).toThrow()
    expect(() => ticketSalesSettings({ groupMinQty: 2, groupPctOff: 100 }, undefined, 4000)).toThrow()
    expect(() => ticketSalesSettings({ groupMinQty: 5, groupPctOff: 10, perBuyerLimit: 3 }, undefined, 4000)).toThrow()
    expect(() => ticketSalesSettings({ groupMinQty: 2, groupPctOff: 10 }, undefined, 0)).toThrow()
  })
  test('patch preserves other values and supports removing a group promotion', () => {
    const previous = ticketSalesSettings({ perBuyerLimit: 8, groupMinQty: 4, groupPctOff: 15 }, undefined, 2500)
    const updated = ticketSalesSettings({ groupMinQty: null, groupPctOff: null }, previous, 2500)
    expect(updated.perBuyerLimit).toBe(8)
    expect(updated.groupMinQty).toBeNull()
    expect(updated.groupPctOff).toBeNull()
  })
  test('rejects noninteger money/quota values and unsafe numbers', () => {
    for (const invalid of [-1, 2.4, NaN, Infinity, 'abc', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => boundedInt(invalid, 'Price', 0, 100_000_000)).toThrow()
    }
    expect(boundedInt('2500', 'Price', 0, 100_000_000)).toBe(2500)
  })
})
