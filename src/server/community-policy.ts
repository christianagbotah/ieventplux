/**
 * Community discussions only surface content from visible, existing events.
 * INVITE_ONLY membership is opt-in by accepted RSVP or a valid ticket.
 */
export const DISCUSSION_READABLE_STATUSES = ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED', 'CANCELLED'] as const
export const DISCUSSION_POSTABLE_STATUSES = ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'] as const

export type CommunityEventState = {
  status: string
  visibility: string
  deletedAt: Date | null
  org: { status: string; deletedAt: Date | null }
}

export function canReadCommunity(
  event: CommunityEventState,
  viewer: { organizer: boolean; approvedRsvp: boolean; validTicket: boolean },
): boolean {
  if (event.deletedAt || event.org.deletedAt || event.org.status !== 'ACTIVE') return false
  if (viewer.organizer) return true
  if (!DISCUSSION_READABLE_STATUSES.includes(event.status as typeof DISCUSSION_READABLE_STATUSES[number])) return false
  if (event.visibility === 'INVITE_ONLY') return viewer.approvedRsvp || viewer.validTicket
  return event.visibility === 'PUBLIC' || event.visibility === 'UNLISTED'
}

export function canWriteCommunity(
  event: CommunityEventState,
  viewer: { organizer: boolean; approvedRsvp: boolean; validTicket: boolean },
): boolean {
  return DISCUSSION_POSTABLE_STATUSES.includes(event.status as typeof DISCUSSION_POSTABLE_STATUSES[number])
    && canReadCommunity(event, viewer)
}

export function validReplyTarget(
  parent: { eventId: string; status: string; parentId: string | null } | null,
  eventId: string,
): boolean {
  return Boolean(parent && parent.eventId === eventId && parent.status === 'VISIBLE' && parent.parentId === null)
}
