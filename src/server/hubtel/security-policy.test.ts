import { describe, expect, test } from 'bun:test'
import { confirmedAmountMatches, simulatorAllowed } from './security-policy'

describe('production simulator isolation', () => {
  test('never simulate in production', () => expect(simulatorAllowed('production')).toBe(false))
  test('development sandbox remains usable', () => expect(simulatorAllowed('development')).toBe(true))
  test('CI/test default can simulate', () => expect(simulatorAllowed('test')).toBe(true))
})

describe('authoritative payment amount', () => {
  test('requires exact integer pesewas', () => expect(confirmedAmountMatches(100, 100)).toBe(true))
  test('rejects missing provider amount', () => expect(confirmedAmountMatches(null, 100)).toBe(false))
  test('rejects mismatched amount', () => expect(confirmedAmountMatches(99, 100)).toBe(false))
  test('rejects noninteger/floating amount', () => expect(confirmedAmountMatches(100.1, 100)).toBe(false))
  test('rejects invalid values', () => {
    expect(confirmedAmountMatches(NaN, 100)).toBe(false)
    expect(confirmedAmountMatches(-1, -1)).toBe(false)
  })
})
