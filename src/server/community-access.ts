import { db } from '@/lib/db'
import { errors } from '@/server/api'
import { getSession } from '@/server/auth'
import { canReadCommunity, canWriteCommunity } from '@/server/community-policy'

/** Shared authorization for all routes that expose or mutate event threads. */
export async function requireCommunityAccess(eventId: string, write = false) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, orgId: true, status: true, visibility: true, deletedAt: true,
      org: { select: { status: true, deletedAt: true, ownerId: true } },
    },
  })
  if (!event) throw errors.notFound('Discussion unavailable.')
  const session = await getSession()
  const userId = session?.user.id ?? null

  const member = userId ? await db.membership.findFirst({
    where: {
      userId, orgId: event.orgId, acceptedAt: { not: null },
      org: { status: 'ACTIVE', deletedAt: null },
    }, select: { id: true },
  }) : null
  const organizer = Boolean(userId && (member || event.org.ownerId === userId))
  let approvedRsvp = false
  let validTicket = false
  if (event.visibility === 'INVITE_ONLY' && userId && !organizer) {
    const [rsvp, ticket] = await Promise.all([
      db.rsvp.findFirst({ where: { eventId, userId, status: 'APPROVED' }, select: { id: true } }),
      db.ticket.findFirst({ where: { eventId, userId, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { id: true } }),
    ])
    approvedRsvp = Boolean(rsvp)
    validTicket = Boolean(ticket)
  }
  const viewer = { organizer, approvedRsvp, validTicket }
  if (!canReadCommunity(event, viewer)) throw errors.notFound('Discussion unavailable.')
  if (write) {
    if (!userId) throw errors.unauthorized()
    if (!canWriteCommunity(event, viewer)) throw errors.forbidden('This discussion is read-only.')
  }
  return { event, userId, organizer }
}
