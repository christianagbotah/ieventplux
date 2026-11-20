/**
 * Deterministic, cursor-based Following timeline. Events and organizer updates
 * are two independent sources and MUST be merged only after enforcing the
 * viewer's follow/block privacy boundary.
 */
export type FollowingKind = 'EVENT' | 'UPDATE'
export type FollowingCursor = { kind: FollowingKind; id: string; at: string }
export type FollowingTimelineRow = { id: string; kind: FollowingKind; activityAt: string }

export function followingOrgIds(
  follows: { orgId: string | null; ownerId: string | null }[],
  blockedOrMutedOwnerIds: Set<string>,
): string[] {
  return Array.from(new Set(
    follows.filter((f) => Boolean(f.orgId && f.ownerId) &&
      !blockedOrMutedOwnerIds.has(f.ownerId as string)).map((f) => f.orgId as string),
  ))
}

export function encodeFollowingCursor(cursor: FollowingCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeFollowingCursor(raw: string | null): FollowingCursor | null {
  if (!raw) return null
  if (raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid feed cursor.')
  let cursor: Partial<FollowingCursor>
  try { cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) } catch { throw new Error('Invalid feed cursor.') }
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) throw new Error('Invalid feed cursor.')
  if ((cursor.kind !== 'EVENT' && cursor.kind !== 'UPDATE') ||
      typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(cursor.id) ||
      typeof cursor.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.at) ||
      !Number.isFinite(Date.parse(cursor.at)) ||
      new Date(cursor.at).toISOString() !== cursor.at) throw new Error('Invalid feed cursor.')
  return cursor as FollowingCursor
}

/**
 * Source-specific seek conditions for createdAt DESC, (kind + id) DESC.
 * At equal timestamps UPDATE sorts after EVENT. This prevents duplication
 * or gaps when paging across two tables with identical creation instants.
 */
export function followingSourceSeek(source: FollowingKind, cursor: FollowingCursor | null) {
  if (!cursor) return {}
  const at = new Date(cursor.at)
  const before = { createdAt: { lt: at } }
  if (source === cursor.kind) return { OR: [before, { createdAt: at, id: { lt: cursor.id } }] }
  if (source === 'EVENT') return { OR: [before, { createdAt: at }] }
  return before
}

export function sortFollowingRows<T extends FollowingTimelineRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    b.activityAt.localeCompare(a.activityAt) ||
    (b.kind + ':' + b.id).localeCompare(a.kind + ':' + a.id),
  )
}

export function cursorForFollowingRow(row: FollowingTimelineRow): string {
  return encodeFollowingCursor({ kind: row.kind, id: row.id, at: row.activityAt })
}
