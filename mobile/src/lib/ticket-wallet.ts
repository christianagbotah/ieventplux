/**
 * Offline ticket wallet — AsyncStorage cache of the signed-in user's ticket
 * list and the QR credentials they have opened. Mobile mirror of the web
 * portal's src/portal/lib/ticket-cache.ts (same honesty contract):
 *
 *  - Only what was actually fetched is cached — the app never invents
 *    tickets, and every cached view is labelled with the time it was saved.
 *  - The list cache is written on every successful load; QR details are
 *    written the moment they are fetched (that is what makes a ticket
 *    scannable when venue connectivity dies at the door).
 *  - All reads degrade to "no cache" instead of crashing (AsyncStorage
 *    failures on exotic targets are swallowed, never fatal).
 *  - signOut() clears the wallet — credentials do not outlive the session.
 *
 * Test seam: storage is injectable via setWalletStore() so the pure logic can
 * run under `bun test` without react-native; with no override every call
 * lazily resolves the real AsyncStorage (src/lib/kv-store.ts) — the app's
 * runtime behavior is byte-for-byte what it was before the seam.
 */

import type { TicketDetail, TicketSummary } from '../api/client'
import { loadDefaultKVStore, type KVStore } from './kv-store'

const LIST_KEY = 'ieventplux.mobile.tickets.v1'
const DETAIL_PREFIX = 'ieventplux.mobile.ticket.'
const MAX_DETAILS = 30

let storeOverride: KVStore | null = null

/** Swap the backing store. Pass null to restore the React Native default. */
export function setWalletStore(store: KVStore | null): void {
  storeOverride = store
}

async function getStore(): Promise<KVStore> {
  return storeOverride ?? loadDefaultKVStore()
}

export interface CachedTicketList {
  savedAt: string
  rows: TicketSummary[]
}

export interface CachedTicketDetail {
  row: TicketDetail
  savedAt: string
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore()
    const raw = await store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    const store = await getStore()
    await store.setItem(key, JSON.stringify(value))
  } catch {
    // Quota / unavailable storage — the wallet is resilience, never critical.
  }
}

export async function cacheTicketList(rows: TicketSummary[]): Promise<void> {
  await writeJson(LIST_KEY, { savedAt: new Date().toISOString(), rows })
}

export async function readCachedTicketList(): Promise<CachedTicketList | null> {
  return readJson<CachedTicketList>(LIST_KEY)
}

export async function cacheTicketDetail(detail: TicketDetail): Promise<void> {
  await writeJson(`${DETAIL_PREFIX}${detail.id}`, { row: detail, savedAt: new Date().toISOString() } satisfies CachedTicketDetail)
  // Trim oldest beyond the cap so the wallet can never grow unbounded.
  try {
    const store = await getStore()
    const keys = await store.getAllKeys()
    const detailKeys = keys.filter((k) => k.startsWith(DETAIL_PREFIX))
    if (detailKeys.length <= MAX_DETAILS) return
    const entries = await Promise.all(
      detailKeys.map(async (k) => ({ key: k, savedAt: (await readJson<CachedTicketDetail>(k))?.savedAt ?? '' }))
    )
    entries.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    const stale = entries.slice(0, entries.length - MAX_DETAILS).map((e) => e.key)
    if (stale.length > 0) await store.multiRemove(stale)
  } catch {
    // ignore — trimming is best-effort
  }
}

export async function readCachedTicketDetail(id: string): Promise<CachedTicketDetail | null> {
  return readJson<CachedTicketDetail>(`${DETAIL_PREFIX}${id}`)
}

export async function clearTicketWallet(): Promise<void> {
  try {
    const store = await getStore()
    const keys = await store.getAllKeys()
    const stale = keys.filter((k) => k === LIST_KEY || k.startsWith(DETAIL_PREFIX))
    if (stale.length > 0) await store.multiRemove(stale)
  } catch {
    // ignore
  }
}
