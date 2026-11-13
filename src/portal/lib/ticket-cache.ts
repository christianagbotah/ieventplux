'use client'

/**
 * Offline ticket wallet — localStorage cache of the signed-in user's tickets
 * and the QR details they have opened. This is what makes a ticket scannable
 * when venue connectivity dies: the QR SVG and opaque payload are persisted
 * client-side the moment they are fetched, and every read is wrapped so
 * private-mode/quota failures degrade to "no cache" instead of crashing.
 *
 * Honesty contract: only what was actually opened (plus the last list) is
 * cached — never invent tickets, and every cached view is labelled with the
 * time it was saved.
 */

const LIST_KEY = 'ievp.tickets.v1'
const DETAIL_PREFIX = 'ievp.ticket.'
const MAX_DETAILS = 30

export interface CachedTicketRow {
  id: string
  code: string
  status: string
  checkedInAt?: string | null
  ticketType: { name: string; kind: string; includesVirtualAccess: boolean }
  event: {
    id: string
    title: string
    slug: string
    startsAt: string
    endsAt: string
    timezone: string
    venue?: { name: string; city?: string | null } | null
    org: { name: string }
  }
}

export interface CachedTicketDetail {
  row: CachedTicketRow
  qrSvg: string
  qrPayload: string
  savedAt: string
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private mode — the wallet is a resilience extra, never critical.
  }
}

export function cacheTicketList(rows: CachedTicketRow[]): void {
  writeJson(LIST_KEY, { savedAt: new Date().toISOString(), rows })
}

export function readCachedTicketList(): { savedAt: string; rows: CachedTicketRow[] } | null {
  return readJson<{ savedAt: string; rows: CachedTicketRow[] }>(LIST_KEY)
}

export function cacheTicketDetail(detail: Omit<CachedTicketDetail, 'savedAt'>): void {
  const entry: CachedTicketDetail = { ...detail, savedAt: new Date().toISOString() }
  writeJson(`${DETAIL_PREFIX}${detail.row.id}`, entry)
  // Trim oldest beyond the cap so the wallet can never blow the quota.
  try {
    const keys: { key: string; savedAt: string }[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(DETAIL_PREFIX)) {
        const v = readJson<CachedTicketDetail>(k)
        if (v) keys.push({ key: k, savedAt: v.savedAt })
      }
    }
    if (keys.length > MAX_DETAILS) {
      keys.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
      for (const stale of keys.slice(0, keys.length - MAX_DETAILS)) window.localStorage.removeItem(stale.key)
    }
  } catch {
    // ignore
  }
}

export function readCachedTicketDetail(id: string): CachedTicketDetail | null {
  return readJson<CachedTicketDetail>(`${DETAIL_PREFIX}${id}`)
}

export function clearTicketCache(): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && (k === LIST_KEY || k.startsWith(DETAIL_PREFIX))) stale.push(k)
    }
    for (const k of stale) window.localStorage.removeItem(k)
  } catch {
    // ignore
  }
}
