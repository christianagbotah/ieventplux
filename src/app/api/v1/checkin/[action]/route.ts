import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, jsonList } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess, orgCan } from '@/server/permissions'
import { deviceToken } from '@/server/ids'
import { sha256 } from '@/server/auth'
import { mayManageScannerSession, scannerLabel } from '@/server/checkin-device-policy'

/**
 * Check-in endpoints:
 *  POST device-sessions → open a device session (offline roster download + durable local queue)
 *  POST scan            → online scan (QR payload or manual code) with duplicate detection
 *  POST sync            → offline batch replay (conflicts preserved, never discarded)
 *  GET  lookup          → manual search
 *  GET  stats           → admissions counts
 */
type RouteContext = { params: Promise<{ action: string }> }

async function checkOwnedDeviceSession(id: string | undefined, eventId: string, userId: string): Promise<string | null> {
  if (!id) return null
  const owned = await db.deviceSession.findFirst({
    where: { id, eventId, userId, revokedAt: null },
    select: { id: true },
  })
  if (!owned) throw errors.forbidden('Device session is not authorized for this event and staff member.')
  return owned.id
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    const user = await requireUser()

    if (action === 'device-sessions') {
      await rateLimit(req, 'register-scanner', 12, 60 * 60_000)
      const body = await readJson<{ eventId?: string; name?: string }>(req)
      const eventId = String(body.eventId ?? '')
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in requires check-in staff permissions for this event.')
      const name = scannerLabel(body.name ?? user.displayName)
      if (!name) throw errors.badRequest('Scanner name must contain 2 to 80 printable characters.')
      const active = await db.deviceSession.count({
        where: { eventId, userId: user.id, revokedAt: null },
      })
      if (active >= 10) throw errors.conflict('You already have 10 active scanners for this event. Revoke an unused session first.')
      const token = deviceToken()
      const session = await db.deviceSession.create({
        data: { eventId, userId: user.id, name, tokenHash: sha256(token) },
      })
      return jsonOk({ deviceSessionId: session.id, deviceToken: token }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    if (action === 'scan') {
      await rateLimit(req, 'scan', 120, 60_000)
      const body = await readJson<{ eventId?: string; payload?: string; deviceSessionId?: string; clientScanId?: string; source?: string; capturedOfflineAt?: string }>(req)
      const eventId = String(body.eventId ?? '')
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in requires check-in staff permissions for this event.')
      if (!body.payload || !body.clientScanId) throw errors.badRequest('payload and clientScanId are required.')
      const deviceSessionId = await checkOwnedDeviceSession(body.deviceSessionId, eventId, user.id)
      const { processScan } = await import('@/server/services/checkin')
      const result = await processScan({
        eventId,
        scannerId: user.id,
        payload: String(body.payload),
        deviceSessionId,
        clientScanId: String(body.clientScanId),
        // A direct online scan cannot assert that it was offline.
        source: 'ONLINE',
        capturedOfflineAt: body.capturedOfflineAt ? String(body.capturedOfflineAt) : null,
      })
      return jsonOk(result)
    }

    if (action === 'sync') {
      await rateLimit(req, 'sync', 30, 60_000)
      const body = await readJson<{ eventId?: string; deviceSessionId?: string; scans?: { payload: string; clientScanId: string; capturedOfflineAt?: string }[] }>(req)
      const eventId = String(body.eventId ?? '')
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in requires check-in staff permissions for this event.')
      const scans = Array.isArray(body.scans) ? body.scans.slice(0, 200) : []
      const deviceSessionId = await checkOwnedDeviceSession(body.deviceSessionId, eventId, user.id)
      const { processScan } = await import('@/server/services/checkin')
      const results: Awaited<ReturnType<typeof processScan>>[] = []
      for (const scan of scans) {
        results.push(
          await processScan({
            eventId,
            scannerId: user.id,
            payload: String(scan.payload ?? ''),
            deviceSessionId,
            clientScanId: String(scan.clientScanId ?? ''),
            source: 'OFFLINE_SYNC',
            capturedOfflineAt: scan.capturedOfflineAt,
          })
        )
      }
      if (deviceSessionId) {
        await db.deviceSession.update({ where: { id: deviceSessionId }, data: { lastSyncAt: new Date() } })
      }
      return jsonOk({ synced: results.length, results })
    }

    throw errors.notFound('Unknown check-in action.')
  })
}

/** Mutating scanner access requires an accepted event membership. A check-in
 * staffer may rename/revoke their own scanner; event editors may manage any
 * session in that event. Never return device tokens or their hashes. */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    if (action !== 'device-sessions') throw errors.notFound('Unknown check-in action.')
    const user = await requireUser()
    await rateLimit(req, 'manage-scanner', 30, 60_000)
    const body = await readJson<{
      eventId?: string; deviceSessionId?: string;
      operation?: string; name?: unknown
    }>(req)
    const eventId = String(body.eventId ?? '')
    const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed || !access.membership) throw errors.forbidden('Check-in access is required.')
    const id = String(body.deviceSessionId ?? '')
    if (!id || id.length > 128) throw errors.badRequest('A valid scanner session is required.')
    if (body.operation !== 'RENAME' && body.operation !== 'REVOKE') {
      throw errors.badRequest('Scanner action must be RENAME or REVOKE.')
    }
    const current = await db.deviceSession.findFirst({
      where: { id, eventId },
      select: { id: true, userId: true, name: true, revokedAt: true },
    })
    if (!current) throw errors.notFound('Scanner session not found.')
    if (!mayManageScannerSession(access.membership.role, user.id, current.userId)) {
      throw errors.forbidden('You can only manage your own scanner sessions.')
    }
    if (current.revokedAt) throw errors.conflict('This scanner session has already been revoked.')
    const nextName = body.operation === 'RENAME' ? scannerLabel(body.name) : null
    if (body.operation === 'RENAME' && !nextName) {
      throw errors.badRequest('Scanner name must contain 2 to 80 printable characters.')
    }
    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.deviceSession.updateMany({
        where: { id, eventId, revokedAt: null },
        data: body.operation === 'REVOKE'
          ? { revokedAt: new Date() } : { name: nextName! },
      })
      if (updated.count !== 1) return false
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorLabel: user.displayName,
          action: body.operation === 'REVOKE' ? 'CHECKIN_SCANNER_REVOKED' : 'CHECKIN_SCANNER_RENAMED',
          entityType: 'DeviceSession',
          entityId: id,
          before: JSON.stringify({ eventId, name: current.name, revoked: false }),
          after: JSON.stringify({
            eventId,
            ...(body.operation === 'RENAME' ? { name: nextName } : { revoked: true }),
          }),
        },
      })
      return true
    })
    if (!changed) throw errors.conflict('This scanner was modified. Refresh and try again.')
    return jsonOk({
      deviceSessionId: id, eventId,
      revoked: body.operation === 'REVOKE',
      ...(nextName ? { name: nextName } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    const user = await requireUser()
    const url = new URL(req.url)

    if (action === 'lookup') {
      const eventId = url.searchParams.get('eventId') ?? ''
      const q = url.searchParams.get('q') ?? ''
      const access = await eventOrgAccess(user.id, eventId, 'attendees:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Attendee search requires event staff permissions.')
      const { manualLookup } = await import('@/server/services/checkin')
      const items = await manualLookup(eventId, q)
      return jsonList(items, items.length, 1, 25)
    }

    if (action === 'stats') {
      const eventId = url.searchParams.get('eventId') ?? ''
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in stats require event staff permissions.')
      const { checkinStats } = await import('@/server/services/checkin')
      return jsonOk(await checkinStats(eventId))
    }

    if (action === 'monitor') {
      const eventId = url.searchParams.get('eventId') ?? ''
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Admission monitoring requires event check-in permissions.')
      const { checkinOperations } = await import('@/server/services/checkin-monitor')
      return jsonOk(await checkinOperations(eventId, user.id, access.membership!.role), {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    if (action === 'roster') {
      // Encrypted/minimized offline roster: only id + code + name + status — no payment data.
      const eventId = url.searchParams.get('eventId') ?? ''
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Roster download requires check-in staff permissions.')
      const tickets = await db.ticket.findMany({
        where: { eventId },
        select: { id: true, code: true, holderName: true, status: true, ticketTypeId: true },
      })
      const event = await db.event.findUnique({ where: { id: eventId }, select: { title: true, startsAt: true } })
      const membership = await db.membership.findFirst({ where: { userId: user.id, orgId: access.event.orgId } })
      if (!membership || !orgCan(membership.role, 'checkin:scan')) throw errors.forbidden()
      return jsonOk({
        event: { id: eventId, title: event?.title, startsAt: event?.startsAt },
        rosterVersion: `v${Date.now()}`,
        count: tickets.length,
        tickets,
        note: 'Download scope is minimized for offline check-in. Offline scans queue locally and sync with conflict preservation.',
      })
    }

    if (action === 'device-sessions') {
      const eventId = url.searchParams.get('eventId') ?? ''
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.allowed) throw errors.forbidden()
      const sessions = await db.deviceSession.findMany({
        where: { eventId }, orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, name: true, userId: true, createdAt: true, lastSyncAt: true, revokedAt: true },
      })
      return jsonOk({ items: sessions }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    throw errors.notFound('Unknown check-in endpoint.')
  })
}
