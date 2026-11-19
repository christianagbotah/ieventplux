import { db } from '@/lib/db'
import { getSession } from './auth'
import { errors } from './api'
import { membershipFor } from './permissions'

/** Event detail programme visibility is separate from event discovery. Drafts
 * require membership; invite-only programme documents require approved guests. */
export async function canViewProgramme(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, orgId: true, status: true, visibility: true, deletedAt: true } })
  if (!event || event.deletedAt) throw errors.notFound('Event not found.')
  const session = await getSession()
  const member = session ? await membershipFor(session.user.id, event.orgId) : null
  const isPublished = ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED', 'CANCELLED'].includes(event.status)
  if (!member && !isPublished) throw errors.notFound('Event not found.')
  if (!member && event.visibility === 'INVITE_ONLY') {
    const rsvp = session ? await db.rsvp.findFirst({ where: { eventId, userId: session.user.id, status: 'APPROVED' }, select: { id: true } }) : null
    const ticket = session ? await db.ticket.findFirst({ where: { eventId, userId: session.user.id, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { id: true } }) : null
    if (!rsvp && !ticket) throw errors.forbidden('The programme is available to approved attendees and organizer staff only.')
  }
  return { event, member }
}
