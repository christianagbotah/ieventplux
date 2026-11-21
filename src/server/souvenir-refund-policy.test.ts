import { describe, expect, test } from 'bun:test'
import { physicalRefundReview } from './souvenir-refund-policy'

describe('physical event merchandise refund safety policy', () => {
  test('ticket-only orders remain eligible for the pre-existing refund path', () => {
    expect(physicalRefundReview({ lines: 0, ordered: 0, collected: 0 })).toBeNull()
  })
  test('uncollected physical items still need stock-and-money reconciliation', () => {
    const note = physicalRefundReview({ lines: 1, ordered: 2, collected: 0 })
    expect(note).toContain('0 of 2 ordered units handed over')
    expect(note).toContain('No provider refund')
  })
  test('partially and fully collected items cannot be treated as instantly restockable', () => {
    for (const collected of [1, 3]) {
      expect(physicalRefundReview({ lines: 2, ordered: 3, collected })).toContain(`${collected} of 3 ordered units handed over`)
    }
  })
  test('inconsistent aggregate snapshots cannot bypass physical refund review', () => {
    for (const input of [
      { lines: 0, ordered: 1, collected: 0 },
      { lines: 0, ordered: 0, collected: 1 },
      { lines: 1, ordered: 0, collected: 0 },
      { lines: 2, ordered: 1, collected: 0 },
      { lines: 1, ordered: 1, collected: 2 },
    ]) {
      expect(() => physicalRefundReview(input)).toThrow('Inconsistent souvenir refund quantities')
    }
  })
  test('invalid counter values are refused instead of silently waived', () => {
    for (const lines of [-1, 1.5, Infinity, NaN]) {
      expect(() => physicalRefundReview({ lines, ordered: 1, collected: 0 })).toThrow()
    }
  })
})
