import type { NotificationItem } from '../api/client'

/** Bounded snapshot. Existing alerts on initial login never replay as new toasts. */
export interface ActivityCursor { latest: number; ids: string[] }
export function reconcileActivity(previous: ActivityCursor | null, rows: NotificationItem[]) {
 const timestamps = rows.map(row => Date.parse(row.createdAt)).filter(Number.isFinite)
 const latest = Math.max(previous?.latest ?? 0, ...timestamps)
 const known = new Set(previous?.ids ?? [])
 const fresh = previous ? rows.filter(row => !row.readAt && !known.has(row.id) && Date.parse(row.createdAt) >= previous.latest) : []
 const ids = [...new Set([...rows.map(row => row.id), ...known])].slice(0, 200)
 return { cursor: {latest, ids}, fresh }
}
