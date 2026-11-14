/**
 * Offline check-in support — the durable queue, roster cache and sync report
 * behind CheckinScreen. AsyncStorage-backed, deliberately dependency-free
 * (no SQLite / no ORM): a door scanner's queue is small, append-only and
 * must survive app kills — AsyncStorage satisfies all three.
 *
 * Honesty contract (mirrors src/server/services/checkin.ts):
 *  - The SERVER is the source of truth for every admission. Offline roster
 *    verdicts are advisory only ("roster match", "not on roster") — the queued
 *    scan is still replayed through POST /checkin/sync with source
 *    OFFLINE_SYNC so real duplicate/conflict detection happens server-side.
 *  - The queue is capped (MAX_QUEUE). When the cap is hit the OLDEST scan is
 *    dropped and counted in `droppedAtCap` — never silently: the banner and
 *    the next sync report both surface it.
 *  - Sync results are retained (bounded) so CONFLICT/DUPLICATE/INVALID
 *    outcomes can be reviewed in the scanner UI after a flush — the old stub
 *    only counted them.
 */

import type { CheckinRosterResponse, CheckinSyncResponse, ScanResult } from '../api/client'
import { loadDefaultKVStore, type KVStore } from './kv-store'

export interface QueuedScan {
  eventId: string
  payload: string
  clientScanId: string
  capturedOfflineAt: string
}

/** Minimal roster row (server returns id/code/holderName/status — nothing else). */
export interface RosterTicket {
  id: string
  code: string
  holderName: string
  status: string
}

export interface RosterCache {
  eventId: string
  eventTitle?: string | null
  rosterVersion: string
  savedAt: string
  count: number
  tickets: RosterTicket[]
}

export interface SyncReportEntry {
  payload: string
  result: ScanResult['result']
  detail: string
  holder?: string
  syncedAt: string
}

export interface SyncReport {
  syncedAt: string
  synced: number
  retained: number
  droppedAtCap: number
  /** Non-ADMITTED outcomes — the entries a door lead must review. */
  review: SyncReportEntry[]
}

const QUEUE_KEY = 'ieventplux.checkin.offlineQueue'
const ROSTER_PREFIX = 'ieventplux.checkin.roster.'
const REPORT_KEY = 'ieventplux.checkin.lastSyncReport'
const MAX_QUEUE = 500
const MAX_REPORT = 40

// ────────────────────────────── injectable store / transport (test seam) ───

/**
 * Storage + transport injection seam. The app NEVER calls the setters: every
 * function defaults to AsyncStorage and the real api client, both resolved
 * lazily via dynamic import so that importing this module never evaluates
 * react-native (which would make the pure logic impossible to load under
 * `bun test`). checkin-offline.test.ts injects an in-memory KVStore and a
 * scripted fake transport here. Runtime behavior without injection is
 * identical to the pre-seam code.
 */
let storeOverride: KVStore | null = null

/** Swap the backing store. Pass null to restore the React Native default. */
export function setOfflineStore(store: KVStore | null): void {
  storeOverride = store
}

async function getStore(): Promise<KVStore> {
  return storeOverride ?? loadDefaultKVStore()
}

/** Request body of POST /checkin/sync (the shape api.checkin.sync accepts). */
export interface CheckinSyncRequest {
  eventId: string
  deviceSessionId?: string
  scans: { payload: string; clientScanId: string; capturedOfflineAt?: string }[]
}

/** Transport surface this module needs from the api client (a subset of api.checkin). */
export interface CheckinTransport {
  roster(eventId: string): Promise<CheckinRosterResponse>
  sync(payload: CheckinSyncRequest): Promise<CheckinSyncResponse>
}

let transportOverride: CheckinTransport | null = null

/** Swap the network transport. Pass null to restore the real api client. */
export function setOfflineTransport(transport: CheckinTransport | null): void {
  transportOverride = transport
}

async function getTransport(): Promise<CheckinTransport> {
  if (transportOverride) return transportOverride
  const { api } = await import('../api/client')
  return api.checkin
}

// ─────────────────────────────────────────────────────────────── queue ───

export async function readQueue(): Promise<QueuedScan[]> {
  try {
    const store = await getStore()
    const raw = await store.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : []
  } catch {
    return []
  }
}

async function writeQueue(items: QueuedScan[]): Promise<void> {
  const store = await getStore()
  await store.setItem(QUEUE_KEY, JSON.stringify(items))
}

export interface EnqueueOutcome {
  pending: number
  droppedAtCap: number
  /** True when the same payload was already queued for this event. */
  duplicate: boolean
}

/**
 * Append one scan. Local dedup: the same payload re-scanned while still
 * offline (camera throttles are not a guarantee — manual entry bypasses
 * them) does not enqueue twice; the server-side idempotency key stays unique
 * per submission, so this is purely queue hygiene.
 */
export async function enqueueOfflineScan(item: QueuedScan): Promise<EnqueueOutcome> {
  const queue = await readQueue()
  const duplicate = queue.some((s) => s.eventId === item.eventId && s.payload === item.payload)
  if (duplicate) return { pending: queue.length, droppedAtCap: 0, duplicate: true }
  let droppedAtCap = 0
  let next = [...queue, item]
  if (next.length > MAX_QUEUE) {
    droppedAtCap = next.length - MAX_QUEUE
    next = next.slice(next.length - MAX_QUEUE)
  }
  await writeQueue(next)
  return { pending: next.length, droppedAtCap, duplicate: false }
}

// ─────────────────────────────────────────────────────────────── roster ───

export async function downloadRoster(eventId: string): Promise<RosterCache> {
  const transport = await getTransport()
  const roster = await transport.roster(eventId)
  const cache: RosterCache = {
    eventId,
    eventTitle: roster.event?.title ?? null,
    rosterVersion: roster.rosterVersion,
    savedAt: new Date().toISOString(),
    count: roster.count,
    tickets: roster.tickets.map((t) => ({ id: t.id, code: t.code, holderName: t.holderName, status: t.status })),
  }
  const store = await getStore()
  await store.setItem(`${ROSTER_PREFIX}${eventId}`, JSON.stringify(cache))
  return cache
}

export async function readRoster(eventId: string): Promise<RosterCache | null> {
  try {
    const store = await getStore()
    const raw = await store.getItem(`${ROSTER_PREFIX}${eventId}`)
    return raw ? (JSON.parse(raw) as RosterCache) : null
  } catch {
    return null
  }
}

export interface OfflineVerdict {
  /** Roster-based advisory result — the server still decides at sync time. */
  verdict: 'ROSTER_MATCH' | 'ROSTER_NOT_VALID' | 'NOT_ON_ROSTER' | 'NO_ROSTER'
  holder?: string
  status?: string
  note: string
}

/**
 * Advisory offline verification. QR payloads are "IEVX1.<ticketId>.<hmac>" —
 * the roster carries ticketId + code, so both QR and manual-code scans can be
 * matched locally. A stale roster can mislead (NOT_ON_ROSTER for a ticket sold
 * after the download) — the note says so explicitly.
 */
export function verifyOffline(roster: RosterCache | null, payload: string): OfflineVerdict {
  if (!roster) return { verdict: 'NO_ROSTER', note: 'No roster downloaded — the server verdict arrives at sync time.' }
  const trimmed = payload.trim()
  let match: RosterTicket | undefined
  const m = /^IEVX1\.([^.\s]+)\./.exec(trimmed)
  if (m) match = roster.tickets.find((t) => t.id === m[1])
  if (!match) match = roster.tickets.find((t) => t.code.toUpperCase() === trimmed.toUpperCase())
  if (!match) {
    return {
      verdict: 'NOT_ON_ROSTER',
      note: 'Not on the downloaded roster — could be an unknown code, or the roster is stale. Queued for the server verdict.',
    }
  }
  if (match.status !== 'VALID') {
    return { verdict: 'ROSTER_NOT_VALID', holder: match.holderName, status: match.status, note: `Roster says ${match.status}. Queued — the server has the final say.` }
  }
  return { verdict: 'ROSTER_MATCH', holder: match.holderName, status: match.status, note: 'Roster match (valid). Queued — the server confirms at sync time.' }
}

// ──────────────────────────────────────────────────────────── sync + report ──

async function writeReport(report: SyncReport): Promise<void> {
  const store = await getStore()
  await store.setItem(REPORT_KEY, JSON.stringify(report))
}

export async function readSyncReport(): Promise<SyncReport | null> {
  try {
    const store = await getStore()
    const raw = await store.getItem(REPORT_KEY)
    return raw ? (JSON.parse(raw) as SyncReport) : null
  } catch {
    return null
  }
}

/** Advisory verdicts from the offline queue (rendered pre-sync). */
export interface PendingVerdictRow {
  payload: string
  verdict: OfflineVerdict['verdict']
  holder?: string
  note: string
  capturedOfflineAt: string
}

/** Advisory verdicts for everything currently queued (for the review panel). */
export async function pendingVerdicts(roster: RosterCache | null, eventId: string): Promise<PendingVerdictRow[]> {
  const queue = await readQueue()
  return queue
    .filter((s) => s.eventId === eventId)
    .map((s) => {
      const v = verifyOffline(roster, s.payload)
      return { payload: s.payload, verdict: v.verdict, holder: v.holder, note: v.note, capturedOfflineAt: s.capturedOfflineAt }
    })
}

/**
 * Flush the queue. Per-event batches (the sync endpoint is event-scoped);
 * failed batches are retained verbatim for the next attempt — a sync is
 * only attempted on connectivity regain / app-active / explicit tap, so
 * there is no busy retry loop to back off from.
 */
export async function syncOfflineQueue(): Promise<SyncReport> {
  const transport = await getTransport()
  const queue = await readQueue()
  const review: SyncReportEntry[] = []
  let synced = 0
  const byEvent = new Map<string, QueuedScan[]>()
  for (const item of queue) {
    const list = byEvent.get(item.eventId) ?? []
    list.push(item)
    byEvent.set(item.eventId, list)
  }
  const remaining: QueuedScan[] = []
  for (const [eventId, scans] of byEvent) {
    try {
      const res = await transport.sync({
        eventId,
        scans: scans.map((s) => ({ payload: s.payload, clientScanId: s.clientScanId, capturedOfflineAt: s.capturedOfflineAt })),
      })
      synced += res.synced
      for (const r of res.results) {
        if (r.result !== 'ADMITTED') {
          review.push({
            payload: r.ticket?.code ?? '(no ticket)',
            result: r.result,
            detail: r.detail,
            holder: r.ticket?.holderName,
            syncedAt: new Date().toISOString(),
          })
        }
      }
    } catch {
      // Offline again / permission lost — keep the batch for the next flush.
      remaining.push(...scans)
    }
  }
  await writeQueue(remaining)
  const report: SyncReport = {
    syncedAt: new Date().toISOString(),
    synced,
    retained: remaining.length,
    droppedAtCap: 0,
    review: review.slice(0, MAX_REPORT),
  }
  await writeReport(report)
  return report
}
