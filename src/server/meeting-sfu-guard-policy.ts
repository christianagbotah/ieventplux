import { canJoinMeeting } from './meeting-policy'

/**
 * Bulk authorisation for a LiveKit media room. All arrays originate from
 * database queries constrained to the same eventId and meetingId; a browser
 * cannot assert role, RSVP, ticket validity or bans.
 */
export interface SfuRoomEntitlements {
  roomStatus: string
  eventOpen: boolean
  orgOwnerId: string
  priced: boolean
  participants: string[]
  hostMemberships: { userId: string; role: string }[]
  approvedRsvps: { userId: string | null }[]
  validTickets: { userId: string | null }[]
  bans: { userId: string }[]
}

const HOST_ROLES = new Set(['OWNER', 'ADMIN', 'EVENT_MANAGER'])

export function findUnauthorizedSfuParticipants(input: SfuRoomEntitlements): string[] {
  const hosts = new Set(input.hostMemberships.filter((m) => HOST_ROLES.has(m.role)).map((m) => m.userId))
  hosts.add(input.orgOwnerId)
  const approved = new Set(input.approvedRsvps.map((r) => r.userId).filter((id): id is string => Boolean(id)))
  const tickets = new Set(input.validTickets.map((r) => r.userId).filter((id): id is string => Boolean(id)))
  const removed = new Set(input.bans.map((r) => r.userId))
  return input.participants.filter((identity) => {
    // Remove unknown/empty identities and users without any durable admission.
    if (!identity || identity.length > 256) return true
    const organizer = hosts.has(identity)
    if (!organizer && removed.has(identity)) return true
    return !canJoinMeeting({
      roomStatus: input.roomStatus,
      validEvent: input.eventOpen,
      signedIn: true,
      organizer,
      approvedRsvp: approved.has(identity),
      validTicket: tickets.has(identity),
      hasPaidTicketType: input.priced,
    })
  })
}

/** No user-visible attendee limit; batching is purely a DB query-size limit. */
export function batchSfuIdentities(identities: string[], querySize = 200): string[][] {
  if (!Number.isSafeInteger(querySize) || querySize < 1 || querySize > 1_000) {
    throw new Error('Invalid reconciliation query size')
  }
  const chunks: string[][] = []
  for (let i = 0; i < identities.length; i += querySize) {
    chunks.push(identities.slice(i, i + querySize))
  }
  return chunks
}
