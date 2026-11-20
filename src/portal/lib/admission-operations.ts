/** Read-only operational monitoring: no ticket credentials or attendee PII. */
export type AdmissionScanResult = 'ADMITTED' | 'DUPLICATE' | 'CONFLICT' | 'INVALID'
export interface AdmissionTotals {
  ticketsIssued: number
  admitted: number
  remaining: number
  validToAdmit: number
  anomalies: number
}
export interface AdmissionOperations {
  eventId: string
  asOf: string
  totals: AdmissionTotals
  recent15Min: {
    attempts: number
    admitted: number
    duplicate: number
    conflict: number
    invalid: number
  }
  scanners: {
    userId: string
    name: string
    attempts15Min: number
    lastScanAt: string
  }[]
  devices: {
    id: string
    name: string
    staffName: string
    createdAt: string
    lastSyncAt: string | null
    revoked: boolean
  }[]
  alerts: {
    id: string
    result: AdmissionScanResult
    scannedAt: string
    source: 'ONLINE' | 'OFFLINE_SYNC'
    staffName: string
  }[]
}

export function groupedRecentScanCounts(
  rows: readonly { result: string; count: number }[],
): AdmissionOperations['recent15Min'] {
  const counts = { attempts: 0, admitted: 0, duplicate: 0, conflict: 0, invalid: 0 }
  for (const row of rows) {
    if (!Number.isSafeInteger(row.count) || row.count < 0) continue
    const name = row.result.toLowerCase()
    if (name === 'admitted' || name === 'duplicate' || name === 'conflict' || name === 'invalid') {
      counts[name] += row.count
      counts.attempts += row.count
    }
  }
  return counts
}

export function admissionProgress(total: number, admitted: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(admitted)) return 0
  return Math.min(100, Math.max(0, Math.round((admitted / total) * 100)))
}

/** Session sync timestamps are NOT evidence that a scanner is online. */
export function deviceSyncLabel(lastSyncAt: string | null): string {
  return lastSyncAt ? 'Last successful sync' : 'No sync recorded'
}
