import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Organizer venue directory (Round 31 — Venue finally gets writers).
 *
 *  GET  /api/v1/orgs/[id]/venues      → the org's venues with live event counts
 *  POST /api/v1/orgs/[id]/venues      → create (OWNER/ADMIN/EVENT_MANAGER)
 *
 * The org id in the URL is a SCOPE, never an authorization source — membership
 * is resolved from the session first (same contract as every org endpoint).
 * Venues are reusable place records: the event editor links events to them,
 * and the public event page renders name/address/map/accessibility from here.
 */

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')
    void req

    const [venues, counts] = await Promise.all([
      db.venue.findMany({ where: { orgId: id }, orderBy: { name: 'asc' } }),
      db.event.groupBy({ by: ['venueId'], where: { venueId: { not: null }, deletedAt: null }, _count: true }),
    ])
    return jsonOk({
      venues: venues.map((v) => ({
        ...v,
        eventCount: counts.find((c) => c.venueId === v.id)?._count ?? 0,
      })),
    })
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')
    if (!orgCan(membership.role, 'event:create')) throw errors.forbidden('Venue management requires an organizer role.')
    await rateLimit(req, 'venue-create', 30, 60_000)

    const body = await readJson<Record<string, unknown>>(req)
    const name = sanitizeText(body.name, 140)
    if (name.length < 3) throw errors.badRequest('Venue name is required (at least 3 characters).')

    const capacity = body.capacity === undefined || body.capacity === null || String(body.capacity) === ''
      ? null
      : Math.round(Number(body.capacity))
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 2_000_000)) {
      throw errors.badRequest('Capacity must be a number between 1 and 2,000,000.')
    }

    const lat = body.lat === undefined || body.lat === null || String(body.lat) === '' ? null : Number(body.lat)
    const lng = body.lng === undefined || body.lng === null || String(body.lng) === '' ? null : Number(body.lng)
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw errors.badRequest('Latitude must be between -90 and 90.')
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) throw errors.badRequest('Longitude must be between -180 and 180.')

    const mapsUrl = sanitizeText(body.mapsUrl, 300)
    if (mapsUrl && !/^https:\/\//.test(mapsUrl)) throw errors.badRequest('The map link must be an https:// URL.')

    const venue = await db.venue.create({
      data: {
        orgId: id,
        name,
        address: sanitizeText(body.address, 200) || null,
        city: sanitizeText(body.city, 60) || null,
        region: sanitizeText(body.region, 60) || null,
        country: (sanitizeText(body.country, 2).toUpperCase() || 'GH').slice(0, 2),
        capacity,
        lat,
        lng,
        mapsUrl: mapsUrl || null,
        accessibilityInfo: sanitizeText(body.accessibilityInfo, 500) || null,
        directionsNote: sanitizeText(body.directionsNote, 500) || null,
      },
    })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'venue.create', entityType: 'Venue', entityId: venue.id, after: { name: venue.name, city: venue.city } })
    return jsonOk({ venue })
  })
}
