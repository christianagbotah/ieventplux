import { describe, expect, test } from 'bun:test'
import { acknowledgedScanIds, MAX_PENDING_SCANS, offlineScanScope, scanKey, validatePendingScan } from './checkin-offline-storage'

describe('Durable offline check-in policy', () => {
  const scan = { eventId: 'ev-1', payload: 'IEVX1.fake.test', clientScanId: 'web-abcd', at: '2026-11-20T12:30:00.000Z' }
  test('isolates queued data between staff accounts and organizations', () => {
    expect(offlineScanScope('user-1','org-1')).not.toBe(offlineScanScope('user-2','org-1'))
    expect(offlineScanScope('user-1','org-1')).not.toBe(offlineScanScope('user-1','org-2'))
    expect(scanKey(offlineScanScope('user-1','org-1'), scan.clientScanId)).toContain('web-abcd')
  })
  test('rejects unbounded codes, missing context and bad timestamps', () => {
    expect(() => validatePendingScan(scan)).not.toThrow()
    expect(() => validatePendingScan({ ...scan, eventId: '../other' })).toThrow()
    expect(() => validatePendingScan({ ...scan, payload: 'a'.repeat(2049) })).toThrow()
    expect(() => validatePendingScan({ ...scan, at: 'invalid' })).toThrow()
    expect(MAX_PENDING_SCANS).toBe(500)
  })
  test('only removes exactly acknowledged batch entries, retaining later entries', () => {
    expect(acknowledgedScanIds([scan, { ...scan, clientScanId: 'web-2' }], 1, [{ result: 'ADMITTED' }])).toEqual(['web-abcd'])
  })
  test('keeps queue intact for malformed, partial or nonauthoritative responses', () => {
    const batch = [scan]
    expect(() => acknowledgedScanIds(batch, 2, [{ result: 'ADMITTED' }])).toThrow()
    expect(() => acknowledgedScanIds(batch, 1, [])).toThrow()
    expect(() => acknowledgedScanIds(batch, 1, [{ result: 'ERROR' }])).toThrow()
    expect(() => acknowledgedScanIds(batch, -1, [])).toThrow()
  })
  test('does not imply offline scans are admitted before server confirmation', () => {
    expect(acknowledgedScanIds([scan], 1, [{ result: 'CONFLICT' }])).toEqual(['web-abcd'])
  })
})
