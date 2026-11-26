import { db } from '@/lib/db'
import { errors } from './api'
import { demandIsOpen, hasDemandEntitlement } from './event-demand-policy'

/** Re-evaluate entitlement from persisted current admission, not a client flag.
 * This helper is safe to call from background jobs without a request/session.
 */
export async function hasCurrentDemandEntitlement(eventId: string, visibility: string, userId?: string | null): Promise<boolean> {
  if (visibility !== 'INVITE_ONLY') return true
  if (!userId) return false
  const [rsvp, ticket] = await Promise.all([
    db.rsvp.findFirst({ where: { eventId, userId, status: 'APPROVED' }, select: { id: true } }),
    db.ticket.findFirst({ where: { eventId, userId, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { id: true } }),
  ])
  return hasDemandEntitlement(visibility, { userId, approvedRsvp: Boolean(rsvp), validTicket: Boolean(ticket) })
}

export async function requireOpenDemand(event: { id: string; visibility: string; status: string; startsAt: Date; deletedAt: Date | null }, userId?: string | null) {
  if (!demandIsOpen(event, new Date())) throw errors.notFound('An upcoming published event is required.')
  if (!await hasCurrentDemandEntitlement(event.id, event.visibility, userId)) {
    throw errors.forbidden('An approved invitation or valid ticket is required.')
  }
}
