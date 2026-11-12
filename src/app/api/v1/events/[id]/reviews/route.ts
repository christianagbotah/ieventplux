import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { listReviews, upsertReview } from '@/server/services/reviews'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET  /api/v1/events/[id]/reviews — aggregate (VISIBLE only) + items + my review + eligibility.
 *      HIDDEN reviews appear only to org staff (moderation) — authors still see their own.
 * POST /api/v1/events/[id]/reviews — create-or-edit my review (ENDED events, fulfilled ticket holders only).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const event = await db.event.findFirst({ where: { OR: [{ slug: id }, { id }] }, select: { id: true, orgId: true, deletedAt: true, visibility: true } })
    if (!event || event.deletedAt) throw errors.notFound('Event not found.')

    const session = await getSession()
    if (event.visibility === 'INVITE_ONLY' && !session) throw errors.notFound('Event not found.')

    const isOrg = session ? Boolean(await db.membership.findFirst({ where: { userId: session.user.id, orgId: event.orgId } })) : false
    const payload = await listReviews(event.id, session?.user.id ?? null, isOrg)
    return jsonOk(payload)
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    rateLimit(req, 'review-write', 10, 60_000)
    const body = await readJson<{ rating?: unknown; body?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)

    // id may be the slug or the internal id (matches the event detail route).
    const event = await db.event.findFirst({ where: { OR: [{ slug: id }, { id }] }, select: { id: true } })
    if (!event) throw errors.notFound('Event not found.')

    const rating = Number(body.rating ?? 0)
    const text = typeof body.body === 'string' ? sanitizeText(body.body, 600) : ''
    const result = await upsertReview({ eventId: event.id, userId: user.id, rating, body: text || undefined })
    return jsonOk({ ...result, note: result.created ? 'Review published.' : 'Review updated.' })
  })
}
