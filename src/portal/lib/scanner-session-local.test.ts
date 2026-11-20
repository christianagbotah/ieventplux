import { describe, expect, test } from 'bun:test'
import { scannerSessionKey } from './scanner-session-local'

describe('browser scanner session reference', () => {
  test('isolated by user, organization and event', () => {
    const a = scannerSessionKey('staff-a', 'org-a', 'event-a')
    expect(a).not.toBe(scannerSessionKey('staff-b', 'org-a', 'event-a'))
    expect(a).not.toBe(scannerSessionKey('staff-a', 'org-b', 'event-a'))
    expect(a).not.toBe(scannerSessionKey('staff-a', 'org-a', 'event-b'))
    expect(a).toContain('staff-a')
  })
  test('never creates a key without an authenticated event context', () => {
    expect(() => scannerSessionKey('', 'org-a', 'event-a')).toThrow()
    expect(() => scannerSessionKey('staff-a', '', 'event-a')).toThrow()
    expect(() => scannerSessionKey('staff-a', 'org-a', '')).toThrow()
  })
})
