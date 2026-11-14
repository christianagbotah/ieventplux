/**
 * Unit tests for the offline ticket wallet (src/lib/ticket-wallet.ts).
 *
 * Runs under Bun's built-in runner (`bun test`) — no Jest, no extra npm
 * dependencies, no react-native: AsyncStorage is replaced through the
 * library's own setWalletStore() seam with an in-memory Map-backed KVStore.
 * The React Native default (real AsyncStorage) is exercised by the app
 * itself; a device/emulator is the documented external blocker, so these
 * tests are the maximum verifiable substitute.
 */

import { beforeEach, describe, expect, test } from 'bun:test'

import {
  cacheTicketDetail,
  cacheTicketList,
  clearTicketWallet,
  readCachedTicketDetail,
  readCachedTicketList,
  setWalletStore,
  type CachedTicketDetail,
} from './ticket-wallet'
import type { TicketDetail, TicketSummary } from '../api/client'
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

/** KVStore whose writes and key enumeration always fail. */
class WriteFailingKVStore extends MemoryKVStore {
  override async setItem(): Promise<void> {
    throw new Error('storage write failed')
  }

  override async getAllKeys(): Promise<string[]> {
    throw new Error('storage enumeration failed')
  }
}

let storage: MemoryKVStore

beforeEach(() => {
  storage = new MemoryKVStore()
  setWalletStore(storage)
})

// ─────────────────────────────────────────────────────────── test data ────

const LIST_KEY = 'ieventplux.mobile.tickets.v1'
const DETAIL_KEY_PREFIX = 'ieventplux.mobile.ticket.'
const MAX_DETAILS = 30

function summary(id: string): TicketSummary {
  return {
    id,
    eventId: 'event-1',
    code: `CODE-${id}`,
    holderName: `Holder ${id}`,
    status: 'VALID',
    checkedInAt: null,
    event: {
      id: 'event-1',
      title: 'Accra Tech Summit',
      slug: 'accra-tech-summit',
      startsAt: '2026-05-01T18:00:00.000Z',
      endsAt: '2026-05-02T02:00:00.000Z',
      timezone: 'Africa/Accra',
      venue: { name: 'Main Hall', city: 'Accra' },
      org: { name: 'Test Org' },
    },
    ticketType: { name: 'General Admission', kind: 'GA' },
  }
}

function detail(id: string): TicketDetail {
  return {
    ...summary(id),
    qrPayload: `IEVX1.${id}.sig`,
    qrSvg: `<svg>qr-${id}</svg>`,
    seatInfo: `Row A Seat ${id}`,
  }
}

/** Detail keys currently present, read straight from the injected map. */
function detailKeys(): string[] {
  return Array.from(storage.map.keys()).filter((k) => k.startsWith(DETAIL_KEY_PREFIX))
}

/** Seed one cached detail directly with a hand-crafted savedAt stamp. */
async function seedDetail(id: string, savedAt: string): Promise<void> {
  const entry: CachedTicketDetail = { row: detail(id), savedAt }
  await storage.setItem(`${DETAIL_KEY_PREFIX}${id}`, JSON.stringify(entry))
}

// ─────────────────────────────────────────────────────── list cache ───────

describe('ticket wallet list cache', () => {
  test('readCachedTicketList is null before anything is cached', async () => {
    expect(await readCachedTicketList()).toBeNull()
  })

  test('list cache write/read round-trips the rows with a real save timestamp', async () => {
    const rows = [summary('t1'), summary('t2')]
    await cacheTicketList(rows)

    const cached = await readCachedTicketList()
    expect(cached).not.toBeNull()
    expect(cached?.rows).toEqual(rows)
    expect(Number.isNaN(new Date(cached?.savedAt ?? '').getTime())).toBe(false)
    expect(cached?.savedAt.length).toBeGreaterThan(10)
  })

  test('re-caching replaces the previous list (one list per wallet)', async () => {
    await cacheTicketList([summary('t1')])
    await cacheTicketList([summary('t2'), summary('t3')])
    const cached = await readCachedTicketList()
    expect(cached?.rows.map((r) => r.id)).toEqual(['t2', 't3'])
  })

  test('a corrupted list cache degrades to null, not a crash', async () => {
    await storage.setItem(LIST_KEY, '{oops')
    expect(await readCachedTicketList()).toBeNull()
  })

  test('a failing storage layer degrades list reads to null', async () => {
    setWalletStore(new BrokenKVStore())
    expect(await readCachedTicketList()).toBeNull()
  })

  test('cacheTicketList never throws even when the write fails', async () => {
    setWalletStore(new WriteFailingKVStore())
    await cacheTicketList([summary('t1')]) // must resolve, not reject
  })
})

// ────────────────────────────────────────────────────── detail cache ──────

describe('ticket wallet detail cache', () => {
  test('readCachedTicketDetail is null for an uncached ticket', async () => {
    expect(await readCachedTicketDetail('never-cached')).toBeNull()
  })

  test('detail cache write/read round-trips the QR credentials', async () => {
    const d = detail('d1')
    await cacheTicketDetail(d)

    const cached = await readCachedTicketDetail('d1')
    expect(cached).not.toBeNull()
    expect(cached?.row).toEqual(d)
    expect(cached?.row.qrPayload).toBe('IEVX1.d1.sig')
    expect(cached?.row.qrSvg).toBe('<svg>qr-d1</svg>')
    expect(Number.isNaN(new Date(cached?.savedAt ?? '').getTime())).toBe(false)
  })

  test('a corrupted detail cache degrades to null, not a crash', async () => {
    await storage.setItem(`${DETAIL_KEY_PREFIX}d1`, '{oops')
    expect(await readCachedTicketDetail('d1')).toBeNull()
  })

  test('a failing storage layer degrades detail reads to null', async () => {
    setWalletStore(new BrokenKVStore())
    expect(await readCachedTicketDetail('d1')).toBeNull()
  })

  test('cacheTicketDetail never throws even when write and trim walk both fail', async () => {
    setWalletStore(new WriteFailingKVStore())
    await cacheTicketDetail(detail('d1')) // writeJson swallows; the trim walk is best-effort
  })
})

// ───────────────────────────────────────── detail cap (MAX_DETAILS=30) ────

describe('ticket wallet detail cap', () => {
  test('caching beyond 30 details evicts the OLDEST by savedAt, and the cap holds thereafter', async () => {
    // Seed 30 details with hand-crafted, strictly increasing savedAt stamps so
    // eviction order is deterministic (the library stamps real wall-clock time,
    // which would tie within a millisecond).
    for (let i = 0; i < 30; i++) {
      await seedDetail(`seed-${i}`, `2024-01-01T00:00:${String(i).padStart(2, '0')}Z`)
    }
    expect(detailKeys()).toHaveLength(30)

    // 30 == the cap: writing one more evicts exactly the oldest.
    await cacheTicketDetail(detail('fresh'))
    let keys = detailKeys()
    expect(keys).toHaveLength(MAX_DETAILS)
    expect(keys.includes(`${DETAIL_KEY_PREFIX}seed-0`)).toBe(false) // oldest evicted
    expect(keys.includes(`${DETAIL_KEY_PREFIX}fresh`)).toBe(true)

    // Five more writes rotate five more oldest entries out — never above 30.
    for (let i = 0; i < 5; i++) await cacheTicketDetail(detail(`more-${i}`))
    keys = detailKeys()
    expect(keys).toHaveLength(MAX_DETAILS)
    for (let i = 1; i <= 5; i++) {
      expect(keys.includes(`${DETAIL_KEY_PREFIX}seed-${i}`)).toBe(false) // next-oldest evicted
    }
    expect(keys.includes(`${DETAIL_KEY_PREFIX}more-4`)).toBe(true)
    expect(keys.includes(`${DETAIL_KEY_PREFIX}fresh`)).toBe(true)
  })

  test('at exactly 30 details nothing is evicted (the trim only fires above the cap)', async () => {
    for (let i = 0; i < 29; i++) await cacheTicketDetail(detail(`d-${i}`))
    expect(detailKeys()).toHaveLength(29)

    await cacheTicketDetail(detail('d-29'))
    const keys = detailKeys()
    expect(keys).toHaveLength(30)
    for (let i = 0; i <= 29; i++) {
      expect(keys.includes(`${DETAIL_KEY_PREFIX}d-${i}`)).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────── signOut clears all ──────

describe('ticket wallet signOut', () => {
  test('clearTicketWallet removes the list and every cached detail — and nothing else', async () => {
    await cacheTicketList([summary('t1')])
    await cacheTicketDetail(detail('d1'))
    await cacheTicketDetail(detail('d2'))
    // Keys owned by other subsystems that share the storage.
    await storage.setItem('ieventplux.mobile.sessionToken', 'tok')
    await storage.setItem('ieventplux.checkin.offlineQueue', '[]')

    await clearTicketWallet()

    expect(await readCachedTicketList()).toBeNull()
    expect(await readCachedTicketDetail('d1')).toBeNull()
    expect(await readCachedTicketDetail('d2')).toBeNull()
    // Unrelated keys are untouched — signOut clears THIS wallet only.
    expect(storage.map.get('ieventplux.mobile.sessionToken')).toBe('tok')
    expect(storage.map.get('ieventplux.checkin.offlineQueue')).toBe('[]')
  })
})
