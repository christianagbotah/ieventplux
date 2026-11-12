import { NextRequest } from 'next/server'
import { handle, jsonOk, jsonList, pagination, errors } from '@/server/api'
import { db } from '@/lib/db'
import { PUBLIC_EVENT_WHERE, sponsoredEvents, buildDiscoveryWhere } from '@/server/services/events'

/**
 * GET /api/v1/discovery/[view] — home | categories | live | reels | search
 * Unlisted and invitation-only events are excluded from every discovery path.
 */

export async function GET(req: NextRequest, ctx: { params: Promise<{ view: string }> }) {
  return handle(async () => {
    const { view } = await ctx.params
    const url = new URL(req.url)
    const now = new Date()

    if (view === 'home') {
      const [featured, upcoming, liveNow, categories, sponsored, stats, cityRows] = await Promise.all([
        db.event.findMany({ where: { ...PUBLIC_EVENT_WHERE, isFeatured: true, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 6,
          select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, city: true, mode: true, categorySlug: true, ticketTypes: { select: { priceMinor: true, quota: true, soldCount: true }, where: { active: true } }, reviews: { select: { rating: true }, where: { status: 'VISIBLE' } }, org: { select: { name: true, slug: true } } } }),
        db.event.findMany({ where: { ...PUBLIC_EVENT_WHERE, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 12,
          select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, city: true, mode: true, categorySlug: true, status: true, ticketTypes: { select: { priceMinor: true, quota: true, soldCount: true }, where: { active: true } }, reviews: { select: { rating: true }, where: { status: 'VISIBLE' } }, org: { select: { name: true, slug: true } } } }),
        db.event.findMany({ where: { ...PUBLIC_EVENT_WHERE, status: 'LIVE' }, take: 6,
          select: { id: true, slug: true, title: true, coverImageUrl: true, mode: true, org: { select: { name: true } }, broadcasts: { select: { id: true, status: true, accessPolicy: true } } } }),
        db.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        sponsoredEvents(3),
        Promise.all([
          db.event.count({ where: { ...PUBLIC_EVENT_WHERE, startsAt: { gte: now } } }),
          db.organization.count({ where: { status: 'ACTIVE', deletedAt: null } }),
          db.event.count({ where: { ...PUBLIC_EVENT_WHERE, status: 'LIVE' } }),
        ]),
        db.event.findMany({ where: { ...PUBLIC_EVENT_WHERE, startsAt: { gte: now }, city: { not: null } }, distinct: ['city'], select: { city: true }, take: 20 }),
      ])
      return jsonOk({
        featured: featured.map((e) => withRating(e)),
        upcoming: upcoming.map((e) => withRating(e)),
        liveNow,
        categories,
        cities: cityRows.map((c) => c.city).filter((c): c is string => Boolean(c)),
        sponsored: sponsored.map((s) => ({
          campaignId: s.campaignId,
          event: { id: s.event.id, slug: s.event.slug, title: s.event.title, summary: s.event.summary, coverImageUrl: s.event.coverImageUrl, startsAt: s.event.startsAt, city: s.event.city, org: { name: s.event.org.name } },
          sponsored: true,
        })),
        stats: { upcomingEvents: stats[0], organizers: stats[1], liveNow: stats[2] },
      })
    }

    if (view === 'live') {
      const broadcasts = await db.liveBroadcast.findMany({
        where: { status: 'LIVE', event: { visibility: 'PUBLIC', deletedAt: null } },
        include: { event: { select: { id: true, slug: true, title: true, coverImageUrl: true, org: { select: { name: true, slug: true } }, startsAt: true } } },
        orderBy: { startedAt: 'desc' },
        take: 20,
      })
      const replays = await db.liveBroadcast.findMany({
        where: { status: 'ENDED', recordingStatus: 'AVAILABLE', event: { visibility: 'PUBLIC', deletedAt: null } },
        include: { event: { select: { id: true, slug: true, title: true, coverImageUrl: true, org: { select: { name: true } } } } },
        take: 12,
      })
      return jsonOk({ live: broadcasts, replays })
    }

    if (view === 'reels') {
      // Short-clip feed from public events (synthetic dev media; see docs/PROVIDER_CAPABILITIES.md).
      const clips = await db.mediaAsset.findMany({
        where: { kind: 'CLIP', status: 'READY', event: { visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] } } },
        include: {
          event: { select: { id: true, slug: true, title: true, startsAt: true, org: { select: { name: true, slug: true } }, ticketTypes: { select: { priceMinor: true }, where: { active: true } } } },
          linksTo: { select: { id: true, slug: true, title: true } },
          org: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
      return jsonOk({
        clips: clips.map((c) => ({
          id: c.id, url: c.url, posterUrl: c.posterUrl ?? c.url, caption: c.caption, durationSec: c.durationSec,
          event: c.event, nextEvent: c.linksTo ? { id: c.linksTo.id, slug: c.linksTo.slug, title: c.linksTo.title } : null,
          org: c.org, views: c.views,
        })),
      })
    }

    if (view === 'categories') {
      const categories = await db.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
      const counts = await db.event.groupBy({ by: ['categorySlug'], where: PUBLIC_EVENT_WHERE, _count: true })
      return jsonOk({ categories: categories.map((c) => ({ ...c, eventCount: counts.find((x) => x.categorySlug === c.slug)?._count ?? 0 })) })
    }

    if (view === 'search') {
      const { page, pageSize, offset } = pagination(req, 12, 36)
      const where = buildDiscoveryWhere({
        q: url.searchParams.get('q') ?? undefined,
        country: url.searchParams.get('country') ?? undefined,
        city: url.searchParams.get('city') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        mode: (url.searchParams.get('mode') as 'PHYSICAL' | 'VIRTUAL' | 'HYBRID' | null) ?? undefined,
        price: (url.searchParams.get('price') as 'FREE' | 'PAID' | null) ?? undefined,
        when: (url.searchParams.get('when') as 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | 'LIVE_NOW' | null) ?? undefined,
        from: url.searchParams.get('from') ?? undefined,
        to: url.searchParams.get('to') ?? undefined,
      })
      if (url.searchParams.get('when') === 'LIVE_NOW') where.status = 'LIVE'
      const items = await db.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: offset,
        take: pageSize,
        select: {
          id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, endsAt: true, city: true, country: true, mode: true, status: true, categorySlug: true,
          org: { select: { name: true, slug: true, verifiedAt: true } },
          ticketTypes: { select: { priceMinor: true, quota: true, soldCount: true }, where: { active: true } },
          reviews: { select: { rating: true }, where: { status: 'VISIBLE' } },
        },
      })
      const total = await db.event.count({ where })
      return jsonList(items.map((e) => withRating(e)), total, page, pageSize)
    }

    throw errors.notFound('Unknown discovery view.')
  })
}

/** Attach an honest rating aggregate (VISIBLE reviews only) to a listing row. */
function withRating<T extends { reviews: { rating: number }[] }>(event: T): Omit<T, 'reviews'> & { ratingAvg: number; ratingCount: number } {
  const count = event.reviews.length
  const avg = count > 0 ? Math.round((event.reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0
  const { reviews: _reviews, ...rest } = event
  return { ...rest, ratingAvg: avg, ratingCount: count }
}
