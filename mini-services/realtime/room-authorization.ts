/**
 * Pure authorization rules for Socket.IO rooms.
 *
 * A user room is ALWAYS private; broadcast rooms require a current playback
 * session or organizer rights; a private event room needs an invitation,
 * ticket or organizer rights. Never trust caller-chosen room names.
 */
export type RoomType = 'user' | 'broadcast' | 'event'
export interface RoomKey { kind: RoomType; id: string }
export interface RoomEvidence {
  activePlayback?: boolean
  orgMember?: boolean
  publicEvent?: boolean
  approvedRsvp?: boolean
  validTicket?: boolean
}
export function parseRoomKey(value: unknown): RoomKey | null {
  if (typeof value !== 'string' || value.length > 90) return null
  const match = /^(user|broadcast|event):([A-Za-z0-9_-]{8,80})$/.exec(value)
  return match ? { kind: match[1] as RoomType, id: match[2] } : null
}
export function canJoinRoom(room: RoomKey, userId: string | null, evidence: RoomEvidence = {}): boolean {
  if (room.kind === 'user') return userId !== null && userId === room.id
  if (room.kind === 'broadcast') return userId !== null && Boolean(evidence.activePlayback || evidence.orgMember)
  return Boolean(evidence.publicEvent || (userId && (evidence.orgMember || evidence.approvedRsvp || evidence.validTicket)))
}
