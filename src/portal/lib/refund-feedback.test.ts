import { describe, expect, test } from 'bun:test'
import { refundActionFeedback } from './refund-feedback'

describe('honest refund operator feedback', () => {
  test('manual review NEVER claims a refund, ledger reversal or physical return', () => {
    const result = refundActionFeedback('process', 'MANUAL_TRACKED')
    expect(result.title).toContain('Manual')
    expect(result.description).toContain('No money was refunded')
    expect(result.description).toContain('no stock was returned')
    expect(result.description).toContain('no tickets or ledger entries were reversed')
  })
  test('approved does not imply payment settlement', () => {
    expect(refundActionFeedback('approve').description).toContain('has not been paid')
  })
  test('processed requires separate provider verification', () => {
    expect(refundActionFeedback('process', 'PROCESSED').description).toContain('Verify the provider settlement')
  })
  test('rejection does not imply customer paid', () => {
    expect(refundActionFeedback('reject').description).toContain('No refund payment was made')
  })
  test('unknown statuses are not treated as completed', () => {
    expect(refundActionFeedback('process', 'MYSTERY').description).toContain('Review the case')
  })
})
