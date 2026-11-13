import { NextRequest } from 'next/server'
import { handle, jsonOk, errors } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { PUBLIC_EVENT_WHERE } from '@/server/services/events'
import { formatMoney } from '@/server/money'

type RouteContext = { params: Promise<{ ref: string }> }

/**
 * GET /api/v1/orders/[ref]/suggestions — round 14 attendee cross-sell.
 *
 * Pure database logic (no LLM, no latency, no fabrication): 2–3 upcoming
 * PUBLIC events the buyer is not already attending, ranked same-category first,
 * then same-city, then demand. Every row carries the real reason it appeared.
 * Same access rule as GET /orders/[ref] (buyer or org staff).
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { ref } = await ctx.params
    const order = await db.order.findUnique({
      where: { reference: ref },
      select: { id: true, userId: true, orgId: true, eventId: true, event: { select: { categorySlug: true, city: true } } },
    })
    if (!order) throw errors.notFound('Order not found.')

    const session = await getSession()
    let allowed = false
    if (session) {
      if (order.userId === session.user.id) allowed = true
      else {
        const membership = await db.membership.findFirst({ where: { userId: session.user.id, orgId: order.orgId } })
        if (membership) allowed = true
      }
    }
    if (!allowed) throw errors.forbidden('You do not have access to this order.')

    const now = new Date()
    const attending = await db.ticket.findMany({
      where: order.userId ? { userId: order.userId, status: { in: ['VALID', 'CHECKED_IN'] } } : { id: '__none__' },
      select: { eventId: true },
    })
    const excludeIds = [...new Set([order.eventId, ...attending.map((t) => t.eventId)])]

    const baseWhere = {
      ...PUBLIC_EVENT_WHERE,
      status: { in: ['PUBLISHED', 'LIVE'] },
      startsAt: { gte: now },
      id: { notIn: excludeIds },
    }
    const select = {
      slug: true, title: true, startsAt: true, city: true, mode: true, categorySlug: true, coverImageUrl: true,
      org: { select: { name: true } },
      ticketTypes: { where: { active: true }, select: { priceMinor: true, quota: true, soldCount: true } },
    } as const

    const [sameCategory, sameCity] = await Promise.all([
      db.event.findMany({ where: { ...baseWhere, categorySlug: order.event.categorySlug }, orderBy: { startsAt: 'asc' }, take: 3, select }),
      order.event.city ? db.event.findMany({ where: { ...baseWhere, city: order.event.city }, orderBy: { startsAt: 'asc' }, take: 3, select }) : Promise.resolve([]),
    ])

    const seen = new Set(sameCategory.map((e) => e.slug))
    const merged = [...sameCategory, ...sameCity.filter((e) => !seen.has(e.slug))].slice(0, 3)
    if (merged.length < 3) {
      const fill = await db.event.findMany({ where: baseWhere, orderBy: [{ startsAt: 'asc' }], take: 6, select })
      for (const e of fill) {
        if (merged.length >= 3) break
        if (!seen.has(e.slug)) {
          seen.add(e.slug)
          merged.push(e)
        }
      }
    }

    return jsonOk({
      items: merged.map((e) => {
        const prices = e.ticketTypes.map((t) => t.priceMinor).filter((p) => p > 0)
        const fromMinor = prices.length ? Math.min(...prices) : 0
        return {
          slug: e.slug,
          title: e.title,
          startsAt: e.startsAt.toISOString(),
          city: e.city,
          mode: e.mode,
          orgName: e.org.name,
          fromLabel: fromMinor > 0 ? `From ${formatMoney(fromMinor)}` : 'Free entry',
          reason:
            e.categorySlug === order.event.categorySlug
              ? `More ${order.event.categorySlug.replace(/-/g, ' ')} like the one you booked`
              : e.city && e.city === order.event.city
                ? 'Happening in the same city'
                : 'Coming up on iEventPlux',
        }
      }),
    })
  })
}
