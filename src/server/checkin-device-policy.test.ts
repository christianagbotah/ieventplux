import { describe, expect, test } from 'bun:test'
import { mayManageScannerSession, scannerLabel } from './checkin-device-policy'

describe('scanner session control policy', () => {
  test('staff can manage only sessions they own', () => {
    expect(mayManageScannerSession('CHECKIN_STAFF', 'person1', 'person1')).toBe(true)
    expect(mayManageScannerSession('CHECKIN_STAFF', 'person1', 'person2')).toBe(false)
    expect(mayManageScannerSession('ANALYST', 'person1', 'person2')).toBe(false)
    expect(mayManageScannerSession('CHECKIN_STAFF', '', '')).toBe(false)
  })
  test('organizer editors may manage event sessions, never other event sessions', () => {
    // Event ownership and accepted membership are independently checked by endpoint.
    expect(mayManageScannerSession('OWNER', 'person1', 'person2')).toBe(true)
    expect(mayManageScannerSession('ADMIN', 'person1', 'person2')).toBe(true)
    expect(mayManageScannerSession('EVENT_MANAGER', 'person1', 'person2')).toBe(true)
    expect(mayManageScannerSession('FINANCE', 'person1', 'person2')).toBe(false)
  })
  test('rejects unsafe, empty or overlong scanner labels', () => {
    expect(scannerLabel('  Gate A — iPhone  ')).toBe('Gate A — iPhone')
    expect(scannerLabel('')).toBeNull()
    expect(scannerLabel('a')).toBeNull()
    expect(scannerLabel('x'.repeat(81))).toBeNull()
    expect(scannerLabel('Gate\nsecret')).toBeNull()
    expect(scannerLabel({ name: 'Gate A' })).toBeNull()
  })
})
