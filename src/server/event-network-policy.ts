/** Event networking is strictly voluntary and limited to genuine attendees. */
export const NETWORK_INTEREST_KIND = 'NETWORK'
export const NETWORK_VISIBLE_PRIVACY = 'PUBLIC'
export const NETWORK_PAGE_SIZE = 16

export type NetworkEvent = {
  status: string
  deletedAt: Date | null
  org: { status: string; deletedAt: Date | null }
}
export type NetworkEntitlement = {
  organizer: boolean
  validTicket: boolean
  approvedRsvp: boolean
  paidTicketRequired: boolean
}
export function eventNetworkingOpen(event: NetworkEvent): boolean {
  return !event.deletedAt && !event.org.deletedAt && event.org.status === 'ACTIVE'
    && ['PUBLISHED', 'LIVE', 'ENDED', 'POSTPONED'].includes(event.status)
}
export function eligibleForEventNetwork(event: NetworkEvent, access: NetworkEntitlement): boolean {
  return eventNetworkingOpen(event) &&
    (access.organizer || access.validTicket || (access.approvedRsvp && !access.paidTicketRequired))
}
export function mayViewNetworkDirectory(input: { eligible: boolean; optedIn: boolean }): boolean {
  return input.eligible && input.optedIn
}
export function validNetworkAction(value: unknown): value is 'join' | 'leave' {
  return value === 'join' || value === 'leave'
}

/** Deliberate public-profile projection: never spread full User records. */
export function publicNetworkProfile(
  person: { id: string; displayName: string; avatarUrl: string | null },
  flags: { following: boolean; isMe: boolean },
) {
  return {
    id: person.id, displayName: person.displayName,
    avatarUrl: person.avatarUrl, following: flags.following, isMe: flags.isMe,
  }
}
