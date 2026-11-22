import { describe, expect, test } from 'bun:test'
import { admissionProgress, deviceSyncLabel, groupedRecentScanCounts } from './admission-operations'

describe('Admission operations monitor', () => {
  test('aggregates only authoritative scan outcome types', () => {
    expect(groupedRecentScanCounts([
      { result: 'ADMITTED', count: 7 }, { result: 'DUPLICATE', count: 2 },
      { result: 'CONFLICT', count: 1 }, { result: 'INVALID', count: 3 },
      { result: 'UNKNOWN', count: 100 },
    ])).toEqual({ attempts: 13, admitted: 7, duplicate: 2, conflict: 1, invalid: 3 })
  })
  test('zero counts and invalid groups do not create fictitious activity', () => {
    expect(groupedRecentScanCounts([])).toEqual({ attempts: 0, admitted: 0, duplicate: 0, conflict: 0, invalid: 0 })
    expect(groupedRecentScanCounts([{ result: 'ADMITTED', count: -1 }, { result: 'INVALID', count: 1.5 }]).attempts).toBe(0)
  })
  test('progress cannot divide by zero or exceed 100 percent', () => {
    expect(admissionProgress(0, 0)).toBe(0)
    expect(admissionProgress(10, 7)).toBe(70)
    expect(admissionProgress(10, 12)).toBe(100)
    expect(admissionProgress(10, -1)).toBe(0)
  })
  test('registration or last sync never claims active connection', () => {
    expect(deviceSyncLabel(null)).toBe('No sync recorded')
    expect(deviceSyncLabel('2026-11-20T15:00:00Z')).toBe('Last successful sync')
  })
})
