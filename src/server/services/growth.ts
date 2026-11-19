/** iEventPlux Growth Intelligence: deterministic, explainable operating guidance.
 * Never label rules as predictive AI. All evidence originates from THIS organizer's
 * upcoming events and ticket inventory, with no synthetic conversion forecasts.
 */
import { db } from '@/lib/db'

const DAY = 86_400_000
export type GrowthPriority = 'critical' | 'high' | 'opportunity' | 'info'
export type GrowthAction = 'events' | 'promotions' | 'attendees' | 'messages'
export interface GrowthEventInput {
  id: string
  title: string
  slug: string
  status: string
  visibility: string
  mode: string
  startsAt: Date
  description: string
  summary: string | null
  coverImageUrl: string | null
  venueId: string | null
  city: string | null
  ticketTypes: { active: boolean; quota: number; soldCount: number }[]
  waiting: number
  issuedLast7Days: number
}
export interface GrowthOpportunity {
  id: string
  eventId: string
  eventTitle: string
  eventSlug: string
  title: string
  detail: string
  priority: GrowthPriority
  action: GrowthAction
  actionLabel: string
  evidence: string
}
export interface GrowthResult {
  source: 'rule-based'
  generatedAt: string
  eventsExamined: number
  draftEvents: number
  publishedUpcoming: number
  ticketsIssuedLast7Days: number
  readyToLaunch: number
  actionableItems: number
  opportunities: GrowthOpportunity[]
  note: string
}

function opportunity(input: GrowthEventInput, key: string, title: string, detail: string, priority: GrowthPriority, action: GrowthAction, actionLabel: string, evidence: string): GrowthOpportunity {
  return { id: `${input.id}:${key}`, eventId: input.id, eventTitle: input.title, eventSlug: input.slug, title, detail, priority, action, actionLabel, evidence }
}

export function buildGrowthIntelligence(rows: readonly GrowthEventInput[], now: Date = new Date()): GrowthResult {
  const priorities: Record<GrowthPriority, number> = { critical: 0, high: 1, opportunity: 2, info: 3 }
  const result: GrowthOpportunity[] = []
  let readyToLaunch = 0
  let ticketsIssuedLast7Days = 0
  let publishedUpcoming = 0
  let draftEvents = 0
  for (const e of rows) {
    const daysOut = Math.ceil((e.startsAt.getTime() - now.getTime()) / DAY)
    const ticketTypes = e.ticketTypes.filter((t) => t.active)
    const isPhysical = e.mode !== 'VIRTUAL'
    const missing = [
      !e.title.trim() ? 'title' : null,
      !e.description.trim() && !e.summary?.trim() ? 'description' : null,
      !e.coverImageUrl ? 'cover image' : null,
      isPhysical && !e.venueId && !e.city?.trim() ? 'location' : null,
      ticketTypes.length === 0 ? 'ticket type' : null,
    ].filter(Boolean) as string[]
    if (missing.length === 0) readyToLaunch++
    if (e.status === 'DRAFT') draftEvents++
    if (e.status === 'PUBLISHED' || e.status === 'SCHEDULED' || e.status === 'LIVE') publishedUpcoming++
    ticketsIssuedLast7Days += e.issuedLast7Days

    if (['CANCELLED', 'ENDED', 'POSTPONED'].includes(e.status) || daysOut < 0) continue
    if (missing.length > 0) {
      result.push(opportunity(e, 'readiness', 'Finish event setup', `Missing: ${missing.join(', ')}. Complete these before promoting your event.`, e.status === 'DRAFT' ? 'high' : 'critical', 'events', 'Complete event', `${missing.length} incomplete setup item${missing.length === 1 ? '' : 's'}`))
    }
    if (e.status === 'DRAFT' && missing.length === 0) {
      result.push(opportunity(e, 'publish', 'Ready for launch', 'Your event details are in place. Review ticketing and publish when you are ready.', 'opportunity', 'events', 'Review and publish', 'All basic launch details present'))
    }
    if (['PUBLISHED', 'SCHEDULED'].includes(e.status) && e.visibility === 'PUBLIC' && daysOut >= 0 && daysOut <= 14 && ticketTypes.length > 0) {
      const bounded = ticketTypes.filter((t) => t.quota > 0)
      const capacity = bounded.reduce((sum, t) => sum + t.quota, 0)
      const sold = bounded.reduce((sum, t) => sum + t.soldCount, 0)
      // Only compare to an explicit quota. Never invent a sales target or demand forecast.
      if (bounded.length === ticketTypes.length && capacity >= 10 && sold / capacity < 0.25) {
        result.push(opportunity(e, 'promotion', 'Build ticket momentum', `${daysOut} day${daysOut === 1 ? '' : 's'} until the event. Consider targeted sharing or an approved promotion; demand is not forecast.`, daysOut <= 3 ? 'high' : 'opportunity', 'promotions', 'Plan promotion', `${sold} of ${capacity} tickets sold (${Math.round((sold / capacity) * 100)}% of configured quota)`))
      }
    }
    if (e.waiting > 0) {
      result.push(opportunity(e, 'waitlist', 'People are waiting for tickets', 'Review remaining ticket inventory and the waitlist before making any capacity change.', 'high', 'events', 'Review inventory', `${e.waiting} active waitlist entr${e.waiting === 1 ? 'y' : 'ies'}`))
    }
    if (['LIVE', 'PUBLISHED'].includes(e.status) && daysOut >= 0 && daysOut <= 2 && ticketTypes.length > 0) {
      result.push(opportunity(e, 'doors', 'Prepare event-day check-in', 'Review staff access, QR scanning and attendee communications before doors open.', 'opportunity', 'attendees', 'Open check-in', `${daysOut} day${daysOut === 1 ? '' : 's'} to start`))
    }
  }
  result.sort((a, b) => priorities[a.priority] - priorities[b.priority] || a.eventTitle.localeCompare(b.eventTitle))
  return {
    source: 'rule-based', generatedAt: now.toISOString(), eventsExamined: rows.length, draftEvents, publishedUpcoming,
    ticketsIssuedLast7Days, readyToLaunch, actionableItems: result.length, opportunities: result.slice(0, 16),
    note: rows.length === 70 ? 'Showing guidance based on the first 70 active events. For larger catalogues, use event-specific reporting.' : 'Actionable guidance uses only your real event setup, inventory and issued tickets. No revenue or demand forecasts are implied.',
  }
}

export async function orgGrowthIntelligence(orgId: string, now: Date = new Date()): Promise<GrowthResult> {
  const since = new Date(now.getTime() - 7 * DAY)
  const events = await db.event.findMany({
    where: { orgId, deletedAt: null, status: { in: ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'LIVE', 'POSTPONED'] }, startsAt: { gte: new Date(now.getTime() - DAY) } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: 70,
    select: {
      id: true, title: true, slug: true, status: true, visibility: true, mode: true, startsAt: true,
      description: true, summary: true, coverImageUrl: true, venueId: true, city: true,
      ticketTypes: { select: { active: true, quota: true, soldCount: true } },
      _count: { select: { waitlistEntries: { where: { status: { in: ['WAITING', 'NOTIFIED'] } } } } },
    },
  })
  if (!events.length) return buildGrowthIntelligence([], now)
  const issued = await db.ticket.groupBy({
    by: ['eventId'],
    where: { eventId: { in: events.map((event) => event.id) }, event: { orgId }, issuedAt: { gte: since }, status: { in: ['VALID', 'CHECKED_IN'] } },
    _count: { _all: true },
  })
  const issuedCounts = new Map(issued.map((row) => [row.eventId, row._count._all]))
  return buildGrowthIntelligence(events.map((event) => ({
    ...event, waiting: event._count.waitlistEntries,
    issuedLast7Days: issuedCounts.get(event.id) ?? 0,
  })), now)
}
