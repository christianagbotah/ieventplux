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
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TicketDetail, TicketSummary } from '../api/client'

const LIST_KEY = 'ieventplux.mobile.tickets.v1'
const DETAIL_PREFIX = 'ieventplux.mobile.ticket.'
const MAX_DETAILS = 30

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
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
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
    const keys = await AsyncStorage.getAllKeys()
    const detailKeys = keys.filter((k) => k.startsWith(DETAIL_PREFIX))
    if (detailKeys.length <= MAX_DETAILS) return
    const entries = await Promise.all(
      detailKeys.map(async (k) => ({ key: k, savedAt: (await readJson<CachedTicketDetail>(k))?.savedAt ?? '' }))
    )
    entries.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    const stale = entries.slice(0, entries.length - MAX_DETAILS).map((e) => e.key)
    if (stale.length > 0) await AsyncStorage.multiRemove(stale)
  } catch {
    // ignore — trimming is best-effort
  }
}

export async function readCachedTicketDetail(id: string): Promise<CachedTicketDetail | null> {
  return readJson<CachedTicketDetail>(`${DETAIL_PREFIX}${id}`)
}

export async function clearTicketWallet(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const stale = keys.filter((k) => k === LIST_KEY || k.startsWith(DETAIL_PREFIX))
    if (stale.length > 0) await AsyncStorage.multiRemove(stale)
  } catch {
    // ignore
  }
}
