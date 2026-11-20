import { describe, expect, test } from 'bun:test'
import { returnIntakeCapacity, validateReturnCondition, validateReturnDecision } from './souvenir-return-policy'

describe('physical return intake policy', () => {
  test('never intakes more physical units than were handed over', () => {
    expect(returnIntakeCapacity(2, 0)).toBe(2)
    expect(returnIntakeCapacity(2, 1)).toBe(1)
    expect(returnIntakeCapacity(2, 2)).toBe(0)
    expect(() => returnIntakeCapacity(2, 3)).toThrow()
  })
  test('refuses invalid numerical return counters', () => {
    for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => returnIntakeCapacity(invalid, 0)).toThrow()
      expect(() => returnIntakeCapacity(1, invalid)).toThrow()
    }
  })
  test('return inspection conditions are closed enums', () => {
    expect(validateReturnCondition('SEALED')).toBe('SEALED')
    expect(validateReturnCondition('OPENED')).toBe('OPENED')
    expect(validateReturnCondition('DAMAGED')).toBe('DAMAGED')
    expect(validateReturnCondition('READY_TO_RESELL')).toBeNull()
    expect(validateReturnCondition(null)).toBeNull()
  })
  test('review outcomes do not include auto-refunded or restocked states', () => {
    expect(validateReturnDecision('ACCEPTED')).toBe('ACCEPTED')
    expect(validateReturnDecision('REJECTED')).toBe('REJECTED')
    for (const unsupported of ['REFUNDED', 'RESTOCKED', 'PAID', 'FULFILLED']) {
      expect(validateReturnDecision(unsupported)).toBeNull()
    }
  })
})
