import { db } from '@/lib/db'
import { getSession } from './auth'
import { errors } from './api'
import { eligibleForEventNetwork, eventNetworkingOpen, NETWORK_INTEREST_KIND, NETWORK_VISIBLE_PRIVACY } from './event-network-policy'

/** Do not return/serialize attendee identities from this entitlement check. */
export async function networkAccess(eventId: string) {
  const session = await getSession()
  if (!session) throw errors.unauthorized('Sign in to access event networking.')
  const userId = session.user.id
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, orgId: true, visibility: true, deletedAt: true, status: true,
      org: { select: { status: true, deletedAt: true, ownerId: true } },
    },
  })
  if (!event || !eventNetworkingOpen(event)) throw errors.notFound('Event networking is unavailable.')

  const [membership, ticket, rsvp, paidType, ownConsent] = await Promise.all([
    db.membership.findFirst({
      where: { orgId: event.orgId, userId, acceptedAt: { not: null } },
      select: { id: true },
    }),
    db.ticket.findFirst({
      where: { eventId, userId, status: { in: ['VALID', 'CHECKED_IN'] } },
      select: { id: true },
    }),
    db.rsvp.findFirst({
      where: { eventId, userId, status: 'APPROVED' },
      select: { id: true },
    }),
    db.ticketType.findFirst({ where: { eventId, active: true, priceMinor: { gt: 0 } }, select: { id: true } }),
    db.eventInterest.findUnique({
      where: { userId_eventId_kind: { eventId, userId, kind: NETWORK_INTEREST_KIND } },
      select: { privacy: true },
    }),
  ])
  const eligible = eligibleForEventNetwork(event, {
    organizer: Boolean(membership || event.org.ownerId === userId),
    validTicket: Boolean(ticket),
    approvedRsvp: Boolean(rsvp),
    paidTicketRequired: Boolean(paidType),
  })
  // Invitation-only events must not reveal an attendee roster or who joined to
  // unentitled visitors, even when they know the exact internal event ID.
  if (event.visibility === 'INVITE_ONLY' && !eligible) throw errors.notFound('Event networking is unavailable.')

  return { userId, eligible, optedIn: eligible && ownConsent?.privacy === NETWORK_VISIBLE_PRIVACY }
}
