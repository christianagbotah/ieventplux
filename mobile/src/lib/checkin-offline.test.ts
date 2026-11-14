/**
 * Unit tests for the offline check-in queue (src/lib/checkin-offline.ts).
 *
 * Runs under Bun's built-in runner (`bun test`) — no Jest, no extra npm
 * dependencies, no react-native: AsyncStorage and the api client are
 * replaced through the library's own injection seams with an in-memory
 * Map-backed KVStore and a scripted fake transport. The React Native
 * defaults (real AsyncStorage + real api client) are exercised by the app
 * itself — a device/emulator is the documented external blocker for that
 * half of the story, so these tests are the maximum verifiable substitute.
 *
 * Semantics notes (what these tests pin down, honestly):
 *  - Local dedup is by (eventId, payload) — the queue's own hygiene. The
 *    server-side idempotency key (clientScanId) stays unique per submission;
 *    the queue deliberately does NOT dedup on it.
 *  - droppedAtCap is an ENQUEUE-time counter (EnqueueOutcome): the cap is
 *    enforced while appending, and the outcome tells the banner. A sync can
 *    never itself exceed the cap, so syncOfflineQueue reports 0 there.
 */

import { beforeEach, describe, expect, test } from 'bun:test'

import {
  downloadRoster,
  enqueueOfflineScan,
  pendingVerdicts,
  readQueue,
  readRoster,
  readSyncReport,
  setOfflineStore,
  setOfflineTransport,
  syncOfflineQueue,
  verifyOffline,
  type CheckinSyncRequest,
  type CheckinTransport,
  type QueuedScan,
  type RosterCache,
} from './checkin-offline'
import type { CheckinRosterResponse, CheckinSyncResponse, ScanResult } from '../api/client'
import type { KVStore } from './kv-store'

// ─────────────────────────────────────────────────── fakes (no RN here) ────

/** In-memory Map-backed KVStore standing in for AsyncStorage. */
class MemoryKVStore implements KVStore {
  readonly map = new Map<string, string>()

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value)
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.map.keys())
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.map.delete(key)
  }
}

/** KVStore whose reads always fail — mirrors a dead storage layer. */
class BrokenKVStore extends MemoryKVStore {
  override async getItem(): Promise<string | null> {
    throw new Error('storage read failed')
  }
}

/**
 * Scripted stand-in for api.checkin: records every sync request and replies
 * per event with a configured response; events without a configured response
 * throw, simulating connectivity loss mid-flush.
 */
class FakeTransport implements CheckinTransport {
  readonly syncRequests: CheckinSyncRequest[] = []
  readonly syncResponses = new Map<string, CheckinSyncResponse>()
  rosterResponse: CheckinRosterResponse | null = null

  async roster(): Promise<CheckinRosterResponse> {
    if (!this.rosterResponse) throw new Error('no roster response configured')
    return this.rosterResponse
  }

  async sync(payload: CheckinSyncRequest): Promise<CheckinSyncResponse> {
    this.syncRequests.push(payload)
    const response = this.syncResponses.get(payload.eventId)
    if (!response) throw new Error(`simulated connectivity loss for ${payload.eventId}`)
    return response
  }
}

let storage: MemoryKVStore
let transport: FakeTransport

beforeEach(() => {
  storage = new MemoryKVStore()
  transport = new FakeTransport()
  setOfflineStore(storage)
  setOfflineTransport(transport)
})

// ─────────────────────────────────────────────────────────── test data ────

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

function scan(n: number, eventId = 'event-1'): QueuedScan {
  return {
    eventId,
    payload: `IEVX1.ticket-${eventId}-${n}.sig${n}`,
    clientScanId: `scan-${eventId}-${n}`,
    capturedOfflineAt: new Date(T0 + n * 1000).toISOString(),
  }
}

function rosterCache(tickets: { id: string; code: string; holderName: string; status: string }[]): RosterCache {
  return {
    eventId: 'event-1',
    eventTitle: 'Accra Tech Summit',
    rosterVersion: 'rv-1',
    savedAt: new Date(T0).toISOString(),
    count: tickets.length,
    tickets,
  }
}

function admitted(detail: string): ScanResult {
  return { result: 'ADMITTED', detail }
}

function nonAdmitted(result: 'DUPLICATE' | 'CONFLICT' | 'INVALID', code: string, detail: string): ScanResult {
  return {
    result,
    detail,
    ticket: { code, holderName: `Holder ${code}`, ticketType: 'GA', checkedInAt: null },
  }
}

// ─────────────────────────────────────────────────────────────── queue ────

describe('checkin-offline queue', () => {
  test('readQueue is empty when nothing was ever enqueued', async () => {
    expect(await readQueue()).toEqual([])
  })

  test('enqueue persists the scan verbatim and reports the new pending count', async () => {
    const item = scan(1)
    const outcome = await enqueueOfflineScan(item)
    expect(outcome).toEqual({ pending: 1, droppedAtCap: 0, duplicate: false })

    const stored = await readQueue()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toEqual(item) // JSON round-trip preserves every field
  })

  test('re-scanning the same payload for the same event is a duplicate regardless of clientScanId', async () => {
    await enqueueOfflineScan(scan(1))
    // Same (eventId, payload), brand-new idempotency key — queue dedup still fires.
    const again: QueuedScan = { ...scan(1), clientScanId: 'scan-OTHER' }
    const outcome = await enqueueOfflineScan(again)
    expect(outcome).toEqual({ pending: 1, droppedAtCap: 0, duplicate: true })
    expect(await readQueue()).toHaveLength(1)
    // The first submission's clientScanId is the one kept for the server replay.
    expect((await readQueue())[0]?.clientScanId).toBe('scan-event-1-1')
  })

  test('the same payload on a different event is NOT a duplicate', async () => {
    await enqueueOfflineScan(scan(1))
    const outcome = await enqueueOfflineScan(scan(1, 'event-2'))
    expect(outcome).toEqual({ pending: 2, droppedAtCap: 0, duplicate: false })
    expect((await readQueue()).map((s) => s.eventId)).toEqual(['event-1', 'event-2'])
  })

  test('a distinct payload with a recycled clientScanId still enqueues (server dedups by idempotency key; the queue does not)', async () => {
    await enqueueOfflineScan(scan(1))
    const recycled: QueuedScan = { ...scan(2), clientScanId: 'scan-event-1-1' }
    const outcome = await enqueueOfflineScan(recycled)
    expect(outcome.duplicate).toBe(false)
    expect(await readQueue()).toHaveLength(2)
  })

  test('queue caps at 500: the 501st enqueue drops the OLDEST scan and counts it in droppedAtCap', async () => {
    for (let i = 0; i < 500; i++) {
      const outcome = await enqueueOfflineScan(scan(i))
      expect(outcome.pending).toBe(i + 1)
      expect(outcome.droppedAtCap).toBe(0)
      expect(outcome.duplicate).toBe(false)
    }

    const overflow = await enqueueOfflineScan(scan(500))
    expect(overflow).toEqual({ pending: 500, droppedAtCap: 1, duplicate: false })

    const queue = await readQueue()
    expect(queue).toHaveLength(500)
    expect(queue[0]?.payload).toBe(scan(1).payload) // oldest gone, FIFO otherwise intact
    expect(queue[499]?.payload).toBe(scan(500).payload)
    expect(queue.some((s) => s.payload === scan(0).payload)).toBe(false)
  })

  test('every enqueue past the cap keeps dropping exactly one oldest scan', async () => {
    for (let i = 0; i < 502; i++) await enqueueOfflineScan(scan(i))
    // 502 enqueues, cap 500: scans 0 and 1 dropped; the queue holds 2..501.
    const queue = await readQueue()
    expect(queue).toHaveLength(500)
    expect(queue[0]?.payload).toBe(scan(2).payload)
    expect(queue[499]?.payload).toBe(scan(501).payload)
  })

  test('FIFO drain order: a successful flush replays the batch in capture order and empties the queue', async () => {
    await enqueueOfflineScan(scan(1))
    await enqueueOfflineScan(scan(2))
    await enqueueOfflineScan(scan(3))
    expect((await readQueue()).map((s) => s.clientScanId)).toEqual([
      'scan-event-1-1',
      'scan-event-1-2',
      'scan-event-1-3',
    ])

    transport.syncResponses.set('event-1', {
      synced: 3,
      results: [admitted('first'), admitted('second'), admitted('third')],
    })
    const report = await syncOfflineQueue()

    // The transport saw the batch in capture order.
    expect(transport.syncRequests).toHaveLength(1)
    expect(transport.syncRequests[0]?.scans.map((s) => s.clientScanId)).toEqual([
      'scan-event-1-1',
      'scan-event-1-2',
      'scan-event-1-3',
    ])
    expect(report.synced).toBe(3)
    expect(await readQueue()).toEqual([])
  })
})

// ───────────────────────────────────────────── advisory roster verdicts ───

describe('checkin-offline advisory verdicts', () => {
  const roster = rosterCache([
    { id: 'ticket-qr', code: 'QR-CODE-1', holderName: 'Ama Mensah', status: 'VALID' },
    { id: 'ticket-used', code: 'USED-CODE', holderName: 'Kofi Boateng', status: 'USED' },
  ])

  test('no roster downloaded -> NO_ROSTER (the server verdict arrives at sync time)', () => {
    const v = verifyOffline(null, 'anything')
    expect(v.verdict).toBe('NO_ROSTER')
    expect(v.holder).toBeUndefined()
    expect(v.note).toContain('No roster')
  })

  test('QR payload "IEVX1.<ticketId>.<hmac>" matches the roster by ticket id -> ROSTER_MATCH', () => {
    const v = verifyOffline(roster, 'IEVX1.ticket-qr.deadbeef')
    expect(v.verdict).toBe('ROSTER_MATCH')
    expect(v.holder).toBe('Ama Mensah')
    expect(v.status).toBe('VALID')
  })

  test('manual code entry matches case-insensitively -> ROSTER_MATCH', () => {
    expect(verifyOffline(roster, 'qr-code-1').verdict).toBe('ROSTER_MATCH')
  })

  test('a roster match on a non-VALID ticket -> ROSTER_NOT_VALID with the status surfaced', () => {
    const v = verifyOffline(roster, 'IEVX1.ticket-used.sig')
    expect(v.verdict).toBe('ROSTER_NOT_VALID')
    expect(v.status).toBe('USED')
    expect(v.holder).toBe('Kofi Boateng')
    expect(v.note).toContain('USED')
  })

  test('unknown code or payload -> NOT_ON_ROSTER', () => {
    const v = verifyOffline(roster, 'NOT-A-KNOWN-CODE')
    expect(v.verdict).toBe('NOT_ON_ROSTER')
    expect(v.holder).toBeUndefined()
  })

  test('pendingVerdicts lists only the given event, in FIFO order, with one advisory verdict per scan', async () => {
    await enqueueOfflineScan(scan(1)) // IEVX1.ticket-event-1-1... not on the roster above
    await enqueueOfflineScan({ ...scan(2), payload: 'QR-CODE-1' }) // manual code -> roster match
    await enqueueOfflineScan(scan(1, 'event-2')) // different event -> filtered out

    const rows = await pendingVerdicts(roster, 'event-1')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.verdict).toBe('NOT_ON_ROSTER')
    expect(rows[0]?.payload).toBe(scan(1).payload)
    expect(rows[1]?.verdict).toBe('ROSTER_MATCH')
    expect(rows[1]?.holder).toBe('Ama Mensah')
    expect(rows[1]?.capturedOfflineAt).toBe(scan(2).capturedOfflineAt)
  })
})

// ─────────────────────────────────────────────────────── roster cache ─────

describe('checkin-offline roster cache', () => {
  test('readRoster returns null before any download', async () => {
    expect(await readRoster('event-1')).toBeNull()
  })

  test('downloadRoster stores the minimized cache (id/code/holder/status only — server-only fields dropped)', async () => {
    transport.rosterResponse = {
      event: { id: 'event-1', title: 'Accra Tech Summit', startsAt: '2026-05-01T18:00:00.000Z' },
      rosterVersion: 'rv-9',
      count: 2,
      tickets: [
        { id: 't1', code: 'C1', holderName: 'Ama', status: 'VALID' },
        { id: 't2', code: 'C2', holderName: 'Kofi', status: 'USED' },
      ],
      note: 'server-only note that must not be cached',
    }

    const cache = await downloadRoster('event-1')

    expect(cache.eventId).toBe('event-1')
    expect(cache.eventTitle).toBe('Accra Tech Summit')
    expect(cache.rosterVersion).toBe('rv-9')
    expect(cache.count).toBe(2)
    expect(cache.tickets).toEqual([
      { id: 't1', code: 'C1', holderName: 'Ama', status: 'VALID' },
      { id: 't2', code: 'C2', holderName: 'Kofi', status: 'USED' },
    ])

    const stored = await readRoster('event-1')
    expect(stored).toEqual(cache)
    // Exactly the six RosterCache fields persisted — nothing more.
    expect(Object.keys(stored ?? {}).sort()).toEqual(
      ['count', 'eventId', 'eventTitle', 'rosterVersion', 'savedAt', 'tickets'].sort(),
    )
  })

  test('readRoster degrades to null on corrupted storage', async () => {
    await storage.setItem('ieventplux.checkin.roster.event-1', '{not json')
    expect(await readRoster('event-1')).toBeNull()
  })
})

// ─────────────────────────────────────────────── flush + sync report ───────

describe('checkin-offline flush + sync report', () => {
  test('a successful flush drains the queue, sums synced counts per event batch and persists the report', async () => {
    await enqueueOfflineScan(scan(1, 'event-1'))
    await enqueueOfflineScan(scan(2, 'event-1'))
    await enqueueOfflineScan(scan(1, 'event-2'))

    transport.syncResponses.set('event-1', { synced: 2, results: [admitted('ok 1'), admitted('ok 2')] })
    transport.syncResponses.set('event-2', { synced: 1, results: [admitted('ok 3')] })

    const report = await syncOfflineQueue()

    expect(report.synced).toBe(3) // 2 + 1 across the two per-event batches
    expect(report.retained).toBe(0)
    expect(report.droppedAtCap).toBe(0) // drops are counted at enqueue time, not by the flush
    expect(report.review).toEqual([])
    expect(await readQueue()).toEqual([])

    const persisted = await readSyncReport()
    expect(persisted).toEqual(report) // the report itself survives as JSON
  })

  test('non-ADMITTED results (DUPLICATE/CONFLICT/INVALID) are retained for review with code, holder and detail', async () => {
    for (const n of [1, 2, 3, 4]) await enqueueOfflineScan(scan(n, 'event-1'))
    transport.syncResponses.set('event-1', {
      synced: 1,
      results: [
        admitted('first scan admitted'),
        nonAdmitted('DUPLICATE', 'DUP-1', 'Ticket already admitted earlier'),
        nonAdmitted('CONFLICT', 'CON-1', 'Status changed since the scan'),
        nonAdmitted('INVALID', 'INV-1', 'Signature rejected'),
      ],
    })

    const report = await syncOfflineQueue()

    expect(report.synced).toBe(1)
    expect(report.review).toHaveLength(3)
    expect(report.review.map((r) => r.result)).toEqual(['DUPLICATE', 'CONFLICT', 'INVALID'])
    for (const entry of report.review) {
      expect(entry.holder).toBe(`Holder ${entry.payload}`)
      expect(entry.detail.length).toBeGreaterThan(0)
      expect(entry.syncedAt).toBeTruthy()
    }
    const duplicate = report.review[0]
    expect(duplicate?.payload).toBe('DUP-1')
    expect(duplicate?.detail).toBe('Ticket already admitted earlier')
    expect(await readQueue()).toEqual([])
  })

  test('an INVALID result without a ticket is reviewable as "(no ticket)"', async () => {
    await enqueueOfflineScan(scan(1, 'event-1'))
    transport.syncResponses.set('event-1', {
      synced: 0,
      results: [{ result: 'INVALID', detail: 'QR payload unparseable' }],
    })

    const report = await syncOfflineQueue()
    expect(report.review[0]?.payload).toBe('(no ticket)')
    expect(report.review[0]?.result).toBe('INVALID')
    expect(report.review[0]?.detail).toBe('QR payload unparseable')
  })

  test('a failing batch is retained verbatim in FIFO order for the next flush', async () => {
    const original = [scan(1), scan(2), scan(3)]
    for (const s of original) await enqueueOfflineScan(s)

    // FakeTransport throws for event-1 (no response configured).
    const report = await syncOfflineQueue()

    expect(report.synced).toBe(0)
    expect(report.retained).toBe(3)
    expect(report.review).toEqual([])
    expect(await readQueue()).toEqual(original)
  })

  test('mixed flush: the successful event drains, the failing event stays queued verbatim', async () => {
    await enqueueOfflineScan(scan(1, 'event-ok'))
    await enqueueOfflineScan(scan(2, 'event-ok'))
    await enqueueOfflineScan(scan(1, 'event-dead'))
    transport.syncResponses.set('event-ok', { synced: 2, results: [admitted('ok'), admitted('ok')] })

    const report = await syncOfflineQueue()

    expect(report.synced).toBe(2)
    expect(report.retained).toBe(1)
    const queue = await readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.eventId).toBe('event-dead')
    expect(queue[0]?.clientScanId).toBe('scan-event-dead-1')
  })

  test('the review panel is bounded at 40 entries', async () => {
    for (let i = 0; i < 45; i++) await enqueueOfflineScan(scan(i, 'event-1'))
    transport.syncResponses.set('event-1', {
      synced: 0,
      results: Array.from({ length: 45 }, (_, i) => nonAdmitted('INVALID', `INV-${i}`, `bad ${i}`)),
    })

    const report = await syncOfflineQueue()
    expect(report.review).toHaveLength(40)
    expect(report.review[0]?.payload).toBe('INV-0')
    expect(report.review[39]?.payload).toBe('INV-39')
  })

  test('readSyncReport is null before the first flush and degrades to null on corrupted storage', async () => {
    expect(await readSyncReport()).toBeNull()
    await storage.setItem('ieventplux.checkin.lastSyncReport', 'not-json{')
    expect(await readSyncReport()).toBeNull()
  })

  test('readQueue degrades to [] on corrupted queue JSON', async () => {
    await storage.setItem('ieventplux.checkin.offlineQueue', 'nope')
    expect(await readQueue()).toEqual([])
  })

  test('read paths degrade (queue [], report null, roster null) when the storage layer itself fails', async () => {
    setOfflineStore(new BrokenKVStore())
    expect(await readQueue()).toEqual([])
    expect(await readSyncReport()).toBeNull()
    expect(await readRoster('event-1')).toBeNull()
  })
})
