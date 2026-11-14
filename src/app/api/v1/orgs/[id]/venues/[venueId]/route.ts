import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'

type RouteContext = { params: Promise<{ id: string; venueId: string }> }

/**
 * Single-venue management (Round 31).
 *
 *  PATCH  /api/v1/orgs/[id]/venues/[venueId] → edit (organizer role, audited)
 *  DELETE /api/v1/orgs/[id]/venues/[venueId] → remove, BLOCKED while any
 *          non-deleted event still references the venue (honest 409 with the
 *          count — dropping a place out from under live events is not a thing).
 *
 * The venue row is always re-scoped to the URL org: a member of org A can
 * never touch org B's venue by guessing the id.
 */

async function loadScopedVenue(orgId: string, venueId: string) {
  const venue = await db.venue.findUnique({ where: { id: venueId } })
  if (!venue || venue.orgId !== orgId) throw errors.notFound('Venue not found for this organization.')
  return venue
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, venueId } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')
    if (!orgCan(membership.role, 'event:create')) throw errors.forbidden('Venue management requires an organizer role.')
    await rateLimit(req, 'venue-edit', 60, 60_000)
    await loadScopedVenue(id, venueId)

    const body = await readJson<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = sanitizeText(body.name, 140)
      if (name.length < 3) throw errors.badRequest('Venue name is required (at least 3 characters).')
      data.name = name
    }
    for (const [field, max] of [['address', 200], ['city', 60], ['region', 60], ['accessibilityInfo', 500], ['directionsNote', 500]] as const) {
      if (body[field] !== undefined) data[field] = sanitizeText(body[field], max) || null
    }
    if (body.country !== undefined) data.country = (sanitizeText(body.country, 2).toUpperCase() || 'GH').slice(0, 2)

    if (body.capacity !== undefined) {
      const capacity = body.capacity === null || String(body.capacity) === '' ? null : Math.round(Number(body.capacity))
      if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 2_000_000)) {
        throw errors.badRequest('Capacity must be a number between 1 and 2,000,000.')
      }
      data.capacity = capacity
    }
    for (const field of ['lat', 'lng'] as const) {
      if (body[field] !== undefined) {
        const value = body[field] === null || String(body[field]) === '' ? null : Number(body[field])
        if (value !== null && !Number.isFinite(value)) throw errors.badRequest(`${field} must be a number.`)
        if (value !== null && field === 'lat' && (value < -90 || value > 90)) throw errors.badRequest('Latitude must be between -90 and 90.')
        if (value !== null && field === 'lng' && (value < -180 || value > 180)) throw errors.badRequest('Longitude must be between -180 and 180.')
        data[field] = value
      }
    }
    if (body.mapsUrl !== undefined) {
      const mapsUrl = sanitizeText(body.mapsUrl, 300)
      if (mapsUrl && !/^https:\/\//.test(mapsUrl)) throw errors.badRequest('The map link must be an https:// URL.')
      data.mapsUrl = mapsUrl || null
    }
    if (Object.keys(data).length === 0) throw errors.badRequest('Nothing to update.')

    const venue = await db.venue.update({ where: { id: venueId }, data })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'venue.update', entityType: 'Venue', entityId: venueId, after: { name: venue.name, fields: Object.keys(data) } })
    return jsonOk({ venue })
  })
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, venueId } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')
    if (!orgCan(membership.role, 'event:create')) throw errors.forbidden('Venue management requires an organizer role.')
    await rateLimit(req, 'venue-delete', 30, 60_000)
    await loadScopedVenue(id, venueId)

    // Honest guard: a venue still referenced by events (live, past, or draft)
    // cannot be removed — the event page renders its name/address, and the
    // ticket-holder record depends on that context.
    const inUse = await db.event.count({ where: { venueId, deletedAt: null } })
    if (inUse > 0) throw errors.conflict(`This venue is still linked to ${inUse} event${inUse === 1 ? '' : 's'}. Unlink them first (edit each event and clear the venue).`)

    const venue = await db.venue.delete({ where: { id: venueId } })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'venue.delete', entityType: 'Venue', entityId: venueId, before: { name: venue.name, city: venue.city } })
    return jsonOk({ deleted: true })
  })
}
