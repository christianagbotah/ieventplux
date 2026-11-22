/**
 * Browser-local durable pending scan queue.
 *
 * This is NOT an offline ticket validator: entries stay pending until the
 * authorized server validates them. QR bearer credentials are sensitive, so
 * this queue contains only the minimum fields and is isolated per signed-in
 * user/organization. Do not store rosters, buyer emails, or payment details.
 *
 * Browsers may evict site data, and same-origin script access is possible.
 * Operators should sync promptly and avoid shared/public devices.
 */
export type PendingScan = {
  eventId: string
  payload: string
  clientScanId: string
  at: string
}
type StoredScan = PendingScan & { key: string; scope: string }

const DB_NAME = 'ieventplux-checkin-pending-v1'
const STORE_NAME = 'pending'
const INDEX_NAME = 'scope'
export const MAX_PENDING_SCANS = 500

export function offlineScanScope(userId: string, orgId: string): string {
  if (!userId || !orgId) throw new Error('Offline check-in requires an authenticated organizer.')
  return JSON.stringify([userId, orgId])
}

export function scanKey(scope: string, clientScanId: string): string {
  return scope + ':' + clientScanId
}

/** A code already pending for this event must not create repeated offline
 * admission attempts when it remains in the camera frame. */
export function isAlreadyPending(scans: PendingScan[], eventId: string, payload: string): boolean {
  const normalized = payload.trim().toUpperCase()
  return scans.some((scan) => scan.eventId === eventId && scan.payload.trim().toUpperCase() === normalized)
}

export function validatePendingScan(value: PendingScan): void {
  if (!value.eventId || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.eventId)) throw new Error('Invalid event context.')
  if (!value.clientScanId || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.clientScanId)) throw new Error('Invalid scan identifier.')
  if (!value.payload.trim() || value.payload.length > 2048) throw new Error('Ticket code cannot be stored safely.')
  if (!Number.isFinite(Date.parse(value.at))) throw new Error('Scan timestamp is invalid.')
}

/** Reconcile only server-acknowledged scan IDs (not every item in the batch). */
export function acknowledgedScanIds<T extends { clientScanId: string }>(
  batch: T[],
  synced: number,
  results: unknown,
): string[] {
  if (!Number.isSafeInteger(synced) || synced < 0 || synced > batch.length ||
    !Array.isArray(results) || results.length !== synced ||
    !results.every((entry) => entry && typeof entry === 'object' &&
      ['ADMITTED', 'DUPLICATE', 'INVALID', 'CONFLICT'].includes((entry as { result?: string }).result ?? ''))) {
    throw new Error('The server returned an incomplete reconciliation. Scans are kept for retry.')
  }
  return batch.slice(0, synced).map((scan) => scan.clientScanId)
}

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is not available. Offline queueing is disabled.'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex(INDEX_NAME, 'scope', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Cannot open the browser check-in queue.'))
    request.onblocked = () => reject(new Error('Another tab is blocking the browser queue upgrade. Close old check-in tabs and retry.'))
  })
}

async function operate<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, done: (value: T) => void, abort: (message: string) => void) => void,
): Promise<T> {
  const db = await openQueue()
  return new Promise<T>((resolve, reject) => {
    let result: T
    let failed: string | null = null
    try {
      const tx = db.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onabort = () => { db.close(); reject(new Error(failed ?? 'Browser could not save the pending ticket scan.')) }
      tx.onerror = () => { /* abort handler reports the error */ }
      operation(store, (value) => { result = value }, (message) => { failed = message; tx.abort() })
    } catch {
      db.close()
      reject(new Error('Browser storage is unavailable. The ticket scan was not queued.'))
    }
  })
}

export async function loadPendingScans(scope: string): Promise<PendingScan[]> {
  return operate<PendingScan[]>('readonly', (store, done) => {
    const request = store.index(INDEX_NAME).getAll(scope)
    request.onsuccess = () => {
      const records = (request.result as StoredScan[])
        .map(({ eventId, payload, clientScanId, at }) => ({ eventId, payload, clientScanId, at }))
        .sort((a,b) => a.at.localeCompare(b.at))
      done(records)
    }
  })
}

export async function savePendingScan(scope: string, scan: PendingScan): Promise<void> {
  validatePendingScan(scan)
  return operate<void>('readwrite', (store, done, abort) => {
    const count = store.index(INDEX_NAME).count(scope)
    count.onsuccess = () => {
      if (count.result >= MAX_PENDING_SCANS) {
        abort('This device has 500 pending scans. Sync existing scans before accepting more.')
        return
      }
      const row: StoredScan = { ...scan, scope, key: scanKey(scope, scan.clientScanId) }
      store.add(row)
      done(undefined)
    }
  })
}

export async function acknowledgePendingScans(scope: string, scanIds: string[]): Promise<void> {
  if (scanIds.length === 0) return
  return operate<void>('readwrite', (store, done) => {
    for (const id of scanIds) store.delete(scanKey(scope, id))
    done(undefined)
  })
}
