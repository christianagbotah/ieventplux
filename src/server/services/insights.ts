import { db } from '../../lib/db'

/**
 * Organizer insights — analytics computed ONLY from real transactional rows
 * (orders, order items, tickets, scans, reviews, waitlist). No page-view or
 * "engagement" metrics are invented: if a signal cannot be derived from the
 * database, it is not shown.
 *
 * Windows: the trend covers the last 14 days (inclusive of today, Accra);
 * totals are all-time. Check-in rate uses CHECKED_IN / all issued tickets.
 */

const DAY_MS = 86_400_000

export interface InsightsDay {
  date: string // YYYY-MM-DD (Africa/Accra)
  tickets: number // tickets issued that day
  grossMinor: number // order gross settled (paidAt) that day
}

export interface InsightsEventRow {
  id: string
  title: string
  slug: string
  startsAt: string
  status: string
  tickets: number
  grossMinor: number
  checkedIn: number
  ratingAvg: number | null
  reviewCount: number
}

export interface InsightsTicketMixRow {
  name: string
  eventId: string
  tickets: number
  revenueMinor: number // discount-aware (sum of real order line totals)
}

export interface OrgInsights {
  windowDays: number
  totals: {
    eventsHeld: number
    eventsUpcoming: number
    liveNow: number
    ticketsSold: number
    grossMinor: number
    windowTickets: number
    windowGrossMinor: number
    checkedIn: number
    checkInRate: number // 0–1, rounded to 2 dp
    avgRating: number | null
    waitlistDemand: number
  }
  trend: InsightsDay[]
  topEvents: InsightsEventRow[]
  ticketMix: InsightsTicketMixRow[]
}

function dayKey(date: Date, tz = 'Africa/Accra'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export async function orgInsights(orgId: string, windowDays = 14): Promise<OrgInsights> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - (windowDays - 1) * DAY_MS)
  windowStart.setHours(0, 0, 0, 0)

  const [
    eventsHeld,
    eventsUpcoming,
    liveNow,
    ticketsSold,
    grossAgg,
    windowTickets,
    checkedIn,
    ratingAgg,
    waitlistDemand,
    windowOrders,
    ticketRows,
  ] = await Promise.all([
    db.event.count({ where: { orgId, deletedAt: null, OR: [{ status: 'ENDED' }, { status: { in: ['PUBLISHED', 'POSTPONED'] }, startsAt: { lt: now } }] } }),
    db.event.count({ where: { orgId, deletedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED', 'LIVE'] }, startsAt: { gte: now } } }),
    db.event.count({ where: { orgId, deletedAt: null, status: 'LIVE' } }),
    db.ticket.count({ where: { event: { orgId } } }),
    db.order.aggregate({ where: { orgId, status: 'PAID' }, _sum: { totalMinor: true } }),
    db.ticket.count({ where: { event: { orgId }, issuedAt: { gte: windowStart } } }),
    db.ticket.count({ where: { event: { orgId }, status: 'CHECKED_IN' } }),
    db.eventReview.aggregate({ where: { event: { orgId }, status: 'VISIBLE' }, _avg: { rating: true }, _count: true }),
    db.waitlistEntry.count({ where: { event: { orgId }, status: { in: ['WAITING', 'NOTIFIED'] } } }),
    db.order.findMany({ where: { orgId, status: 'PAID', paidAt: { gte: windowStart } }, select: { paidAt: true, totalMinor: true } }),
    db.ticket.findMany({ where: { event: { orgId }, issuedAt: { gte: windowStart } }, select: { issuedAt: true } }),
  ])

  // ── 14-day trend (zero-filled, Accra-local day keys) ──
  const ticketsByDay = new Map<string, number>()
  for (const t of ticketRows) {
    const key = dayKey(t.issuedAt)
    ticketsByDay.set(key, (ticketsByDay.get(key) ?? 0) + 1)
  }
  const grossByDay = new Map<string, number>()
  for (const o of windowOrders) {
    if (!o.paidAt) continue
    const key = dayKey(o.paidAt)
    grossByDay.set(key, (grossByDay.get(key) ?? 0) + o.totalMinor)
  }
  const trend: InsightsDay[] = []
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(windowStart.getTime() + i * DAY_MS)
    const key = dayKey(d)
    trend.push({ date: key, tickets: ticketsByDay.get(key) ?? 0, grossMinor: grossByDay.get(key) ?? 0 })
  }

  // ── Top events by tickets sold (with gross + check-in + rating) ──
  const eventAgg = await db.ticket.groupBy({ by: ['eventId'], where: { event: { orgId } }, _count: { _all: true } })
  const topIds = eventAgg.sort((a, b) => b._count._all - a._count._all).slice(0, 5).map((e) => e.eventId)
  const ticketsById = new Map(eventAgg.map((e) => [e.eventId, e._count._all]))
  let topEvents: InsightsEventRow[] = []
  if (topIds.length > 0) {
    const [events, grossByEvent, checkinsByEvent, reviewsByEvent] = await Promise.all([
      db.event.findMany({ where: { id: { in: topIds } }, select: { id: true, title: true, slug: true, startsAt: true, status: true } }),
      db.order.groupBy({ by: ['eventId'], where: { orgId, status: 'PAID', eventId: { in: topIds } }, _sum: { totalMinor: true } }),
      db.ticket.groupBy({ by: ['eventId'], where: { event: { orgId }, status: 'CHECKED_IN', eventId: { in: topIds } }, _count: { _all: true } }),
      db.eventReview.groupBy({ by: ['eventId'], where: { event: { orgId }, status: 'VISIBLE', eventId: { in: topIds } }, _avg: { rating: true }, _count: { _all: true } }),
    ])
    const grossMap = new Map(grossByEvent.map((g) => [g.eventId, g._sum.totalMinor ?? 0]))
    const checkinMap = new Map(checkinsByEvent.map((c) => [c.eventId, c._count._all]))
    const reviewMap = new Map(reviewsByEvent.map((r) => [r.eventId, { avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null, count: r._count._all }]))
    topEvents = events
      .map<InsightsEventRow>((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        tickets: ticketsById.get(e.id) ?? 0,
        grossMinor: grossMap.get(e.id) ?? 0,
        checkedIn: checkinMap.get(e.id) ?? 0,
        ratingAvg: reviewMap.get(e.id)?.avg ?? null,
        reviewCount: reviewMap.get(e.id)?.count ?? 0,
      }))
      .sort((a, b) => b.tickets - a.tickets || b.grossMinor - a.grossMinor)
  }

  // ── Ticket mix (discount-aware, from real order line totals) ──
  const mixAgg = await db.orderItem.groupBy({
    by: ['ticketTypeId'],
    where: { order: { orgId, status: 'PAID' } },
    _sum: { qty: true, lineTotalMinor: true },
  })
  const typeIds = mixAgg.map((m) => m.ticketTypeId)
  const types = typeIds.length > 0
    ? await db.ticketType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true, eventId: true } })
    : []
  const typeById = new Map(types.map((t) => [t.id, t]))
  const ticketMix: InsightsTicketMixRow[] = mixAgg
    .map((m) => ({
      name: typeById.get(m.ticketTypeId)?.name ?? 'Unknown type',
      eventId: typeById.get(m.ticketTypeId)?.eventId ?? '',
      tickets: m._sum.qty ?? 0,
      revenueMinor: m._sum.lineTotalMinor ?? 0,
    }))
    .filter((row) => row.tickets > 0)
    .sort((a, b) => b.revenueMinor - a.revenueMinor)
    .slice(0, 8)

  const grossMinor = grossAgg._sum.totalMinor ?? 0
  return {
    windowDays,
    totals: {
      eventsHeld,
      eventsUpcoming,
      liveNow,
      ticketsSold,
      grossMinor,
      windowTickets,
      windowGrossMinor: trend.reduce((sum, d) => sum + d.grossMinor, 0),
      checkedIn,
      checkInRate: ticketsSold > 0 ? Math.round((checkedIn / ticketsSold) * 100) / 100 : 0,
      avgRating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      waitlistDemand,
    },
    trend,
    topEvents,
    ticketMix,
  }
}
