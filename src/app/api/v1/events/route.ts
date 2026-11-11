import { NextRequest } from 'next/server'
import { handle, jsonOk, jsonList, pagination, requireUser, readJson, errors, sanitizeText, parseTags } from '@/server/api'
import { db } from '@/lib/db'
import { buildDiscoveryWhere } from '@/server/services/events'
import { orgCan } from '@/server/permissions'
import { assertCanPublishNewEvent } from '@/server/services/subscriptions'

/**
 * Events API:
 *  GET  /api/v1/events            → public discovery list (filters + pagination)
 *  POST /api/v1/events            → organizer event creation (org-scoped)
 */

const eventCardSelect = {
  id: true, slug: true, title: true, summary: true, categorySlug: true, coverImageUrl: true,
  mode: true, status: true, startsAt: true, endsAt: true, city: true, country: true, timezone: true,
  isFeatured: true, boostedUntil: true, venueId: true,
  org: { select: { id: true, name: true, slug: true, verifiedAt: true } },
  ticketTypes: { select: { priceMinor: true, active: true }, where: { active: true } },
} as const

export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const { page, pageSize, offset } = pagination(req, 12, 36)
    const mine = url.searchParams.get('mine') === '1'

    if (mine) {
      const user = await requireUser()
      const orgId = url.searchParams.get('orgId')
      const where: Record<string, unknown> = { orgId: orgId ?? undefined, deletedAt: null }
      const status = url.searchParams.get('status')
      if (status && status !== 'ALL') where.status = status
      const items = await db.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
        select: { ...eventCardSelect, visibility: true, publishAt: true, seriesId: true },
      })
      const total = await db.event.count({ where })
      return jsonList(items, total, page, pageSize)
    }

    const where = buildDiscoveryWhere({
      q: url.searchParams.get('q') ?? undefined,
      country: url.searchParams.get('country') ?? undefined,
      city: url.searchParams.get('city') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      mode: (url.searchParams.get('mode') as 'PHYSICAL' | 'VIRTUAL' | 'HYBRID' | null) ?? undefined,
      price: (url.searchParams.get('price') as 'FREE' | 'PAID' | null) ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      when: (url.searchParams.get('when') as 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | 'LIVE_NOW' | null) ?? undefined,
    })
    if (url.searchParams.get('when') === 'LIVE_NOW') {
      where.status = 'LIVE'
    }
    const items = await db.event.findMany({
      where,
      orderBy: url.searchParams.get('sort') === 'price' ? { ticketTypes: { _count: 'desc' } } : { startsAt: 'asc' },
      skip: offset,
      take: pageSize,
      select: eventCardSelect,
    })
    const total = await db.event.count({ where })
    return jsonList(items, total, page, pageSize)
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)
    const orgId = String(body.orgId ?? '')
    const { membershipFor } = await import('@/server/permissions')
    const membership = await membershipFor(user.id, orgId)
    if (!membership || !orgCan(membership.role, 'event:create')) throw errors.forbidden('Event creation requires an organizer role in this organization.')
    await assertCanPublishNewEvent(orgId) // plan limits enforced on the backend

    const title = sanitizeText(body.title, 140)
    if (title.length < 3) throw errors.badRequest('Event title is required.')
    const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null
    const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null
    if (!startsAt || Number.isNaN(startsAt.getTime())) throw errors.badRequest('A valid start date/time is required.')
    if (!endsAt || Number.isNaN(endsAt.getTime())) throw errors.badRequest('A valid end date/time is required.')
    if (endsAt <= startsAt) throw errors.badRequest('End must be after start.')

    const mode = ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(body.mode)) ? String(body.mode) : 'PHYSICAL'
    const visibility = ['PUBLIC', 'UNLISTED', 'INVITE_ONLY'].includes(String(body.visibility)) ? String(body.visibility) : 'PUBLIC'
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)}-${Date.now().toString(36)}`

    const event = await db.event.create({
      data: {
        orgId,
        title,
        slug,
        summary: sanitizeText(body.summary, 200) || null,
        description: sanitizeText(body.description, 8000) || '',
        categorySlug: sanitizeText(body.categorySlug, 40) || 'community',
        tags: JSON.stringify(parseTags(body.tags)),
        coverImageUrl: typeof body.coverImageUrl === 'string' && body.coverImageUrl.startsWith('/') ? body.coverImageUrl : null,
        mode,
        visibility,
        status: 'DRAFT',
        venueId: typeof body.venueId === 'string' && body.venueId ? body.venueId : null,
        country: sanitizeText(body.country, 2).toUpperCase() || 'GH',
        city: sanitizeText(body.city, 60) || null,
        timezone: sanitizeText(body.timezone, 60) || 'Africa/Accra',
        startsAt,
        endsAt,
        contactEmail: sanitizeText(body.contactEmail, 160) || null,
        contactPhone: sanitizeText(body.contactPhone, 24) || null,
        accessibilityInfo: sanitizeText(body.accessibilityInfo, 500) || null,
        attendanceRules: sanitizeText(body.attendanceRules, 500) || null,
        ageGuidance: sanitizeText(body.ageGuidance, 60) || null,
        refundPolicy: sanitizeText(body.refundPolicy, 500) || null,
        createdBy: user.id,
      },
    })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'event.create', entityType: 'Event', entityId: event.id, after: { title } })
    return jsonOk({ event })
  })
}
