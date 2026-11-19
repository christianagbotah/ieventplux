import { describe, test, expect } from 'bun:test'
import { normalizeAdminSmsTestPhone, providerTestAcknowledgment } from './communications-test-policy'

describe('Platform administrator messaging tests', () => {
  test('only accepts an E.164-style receiving number with an explicit country code', () => {
    expect(normalizeAdminSmsTestPhone(' +233 24 123 4567 ')).toBe('+233241234567')
    expect(normalizeAdminSmsTestPhone('+447700900123')).toBe('+447700900123')
    for (const value of ['0241234567', '233241234567', '+0', 'abc', '+2331234567\n', '+233241234567, +233555123456', '', null]) {
      expect(normalizeAdminSmsTestPhone(value)).toBeNull()
    }
  })
  test('provider acceptance is never reported as handset or inbox delivery', () => {
    expect(providerTestAcknowledgment({ queued: true, channel: 'SMS' })).toContain('not handset delivery')
    expect(providerTestAcknowledgment({ queued: true, channel: 'EMAIL' })).toContain('remain unverified')
    expect(providerTestAcknowledgment({ queued: false, channel: 'SMS' })).toContain('not queued')
  })
})
