import { db } from '../../lib/db'
import { errors } from '../api'

/**
 * Event lifecycle + discovery visibility rules.
 *
 * Visibility (brief §6):
 *  - PUBLIC: discoverable everywhere.
 *  - UNLISTED: reachable by direct link only; excluded from search, feeds,
 *    discovery APIs and sitemap.
 *  - INVITE_ONLY: additionally requires an invitation for RSVP/tickets.
 * Private guest lists never leave org-scoped endpoints.
 */

export const EVENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'POSTPONED', 'CANCELLED', 'LIVE', 'ENDED'] as const

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'PUBLISHED', 'CANCELLED'],
  SCHEDULED: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['POSTPONED', 'CANCELLED', 'LIVE', 'ENDED'],
  POSTPONED: ['PUBLISHED', 'CANCELLED'],
  LIVE: ['ENDED', 'CANCELLED'],
  CANCELLED: [],
  ENDED: [],
}

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

export const PUBLIC_EVENT_WHERE = {
  visibility: 'PUBLIC',
  deletedAt: null,
  status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'] },
}

export async function transitionEvent(params: { eventId: string; to: string; actorId: string; reason?: string; publishAt?: Date | null }) {
  const event = await db.event.findUnique({ where: { id: params.eventId } })
  if (!event) throw errors.notFound('Event not found.')
  if (!canTransition(event.status, params.to)) {
    throw errors.conflict(`Cannot move an event from ${event.status} to ${params.to}.`)
  }
  const now = new Date()
  const data: Record<string, unknown> = { status: params.to }
  if (params.to === 'PUBLISHED') data.publishedAt = event.publishedAt ?? now
  if (params.to === 'POSTPONED') data.postponedAt = now
  if (params.to === 'CANCELLED') {
    data.cancelledAt = now
    data.cancelReason = params.reason?.slice(0, 500)
  }
  if (params.to === 'SCHEDULED' && params.publishAt) data.publishAt = params.publishAt
  const updated = await db.event.update({ where: { id: event.id }, data })

  // Notify affected attendees about significant changes (never erase financial history).
  if (['CANCELLED', 'POSTPONED'].includes(params.to)) {
    const { notifyUser, queueMessage } = await import('./notify')
    const ticketHolders = await db.ticket.findMany({ where: { eventId: event.id, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { userId: true }, distinct: ['userId'] })
    for (const holder of ticketHolders.slice(0, 1000)) {
      if (!holder.userId) continue
      await notifyUser({
        userId: holder.userId,
        type: 'EVENT_CHANGE',
        title: `${event.title} ${params.to === 'CANCELLED' ? 'cancelled' : 'postponed'}`,
        body:
          params.to === 'CANCELLED'
            ? `This event was cancelled. ${params.reason ? `Reason: ${params.reason}` : 'Refund information is on the event page.'}`
            : 'This event has been postponed. New details will be shared by the organizer.',
        link: `#/event/${event.slug}`,
      }).catch(() => {})
    }
  }
  return updated
}

/** Discovery filters shared by search/home/live endpoints. */
export interface DiscoveryFilters {
  q?: string
  country?: string
  city?: string
  category?: string
  mode?: 'PHYSICAL' | 'VIRTUAL' | 'HYBRID'
  price?: 'FREE' | 'PAID'
  minPriceMinor?: number
  maxPriceMinor?: number
  from?: string
  to?: string
  when?: 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | 'NEAR_ME' | 'LIVE_NOW'
  orgId?: string
  tags?: string[]
}

export function buildDiscoveryWhere(filters: DiscoveryFilters, now = new Date()) {
  const where: Record<string, unknown> = { ...PUBLIC_EVENT_WHERE }
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { summary: { contains: filters.q } },
      { description: { contains: filters.q } },
    ]
  }
  if (filters.country) where.country = filters.country
  if (filters.city) where.city = { contains: filters.city }
  if (filters.category) where.categorySlug = filters.category
  if (filters.mode) where.mode = filters.mode
  if (filters.orgId) where.orgId = filters.orgId
  if (filters.from || filters.to) {
    where.startsAt = {}
    if (filters.from) (where.startsAt as Record<string, unknown>).gte = new Date(filters.from)
    if (filters.to) (where.startsAt as Record<string, unknown>).lte = new Date(filters.to)
  }
  if (filters.when === 'TODAY') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    where.startsAt = { gte: now, lte: end }
  } else if (filters.when === 'THIS_WEEK') {
    const end = new Date(now.getTime() + 7 * 86400_000)
    where.startsAt = { gte: now, lte: end }
  } else if (filters.when === 'THIS_WEEKEND') {
    const sat = new Date(now)
    const daysToSat = (6 - sat.getDay() + 7) % 7
    sat.setDate(sat.getDate() + daysToSat)
    sat.setHours(0, 0, 0, 0)
    const sun = new Date(sat)
    sun.setDate(sun.getDate() + 2)
    where.startsAt = { gte: sat, lte: sun }
  }
  if (filters.price === 'FREE' || filters.price === 'PAID') {
    where.ticketTypes = {
      some: {
        active: true,
        priceMinor: filters.price === 'FREE' ? 0 : { gt: 0 },
      },
    }
  }
  // Never recommend cancelled events as purchasable (brief §7).
  if (filters.price) {
    where.status = { in: ['PUBLISHED', 'LIVE', 'POSTPONED'] }
  }
  return where
}

/** Sponsored placements: running campaigns inside schedule + budget, labelled. */
export async function sponsoredEvents(limit = 3) {
  const campaigns = await db.promotionCampaign.findMany({
    where: { status: 'RUNNING', startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    include: { event: { include: { org: { select: { name: true } } } } },
    take: limit * 2,
    orderBy: { spentMinor: 'desc' },
  })
  const seen = new Set<string>()
  return campaigns
    .filter((c) => c.event.visibility === 'PUBLIC' && !['CANCELLED', 'ENDED'].includes(c.event.status) && !seen.has(c.eventId) && seen.add(c.eventId))
    .slice(0, limit)
    .map((c) => ({ campaignId: c.id, event: c.event, sponsored: true }))
}
