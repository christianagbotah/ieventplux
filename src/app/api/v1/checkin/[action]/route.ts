import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, jsonList } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess, orgCan } from '@/server/permissions'
import { deviceToken } from '@/server/ids'
import { sha256 } from '@/server/auth'

/**
 * Check-in endpoints:
 *  POST device-sessions → open a device session (offline roster download + durable local queue)
 *  POST scan            → online scan (QR payload or manual code) with duplicate detection
 *  POST sync            → offline batch replay (conflicts preserved, never discarded)
 *  GET  lookup          → manual search
 *  GET  stats           → admissions counts
 */
type RouteContext = { params: Promise<{ action: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    const user = await requireUser()

    if (action === 'device-sessions') {
      const body = await readJson<{ eventId?: string; name?: string }>(req)
      const eventId = String(body.eventId ?? '')
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in requires check-in staff permissions for this event.')
      const token = deviceToken()
      const session = await db.deviceSession.create({
        data: { eventId, userId: user.id, name: String(body.name ?? user.displayName).slice(0, 80), tokenHash: sha256(token) },
      })
      return jsonOk({ deviceSessionId: session.id, deviceToken: token })
    }

    if (action === 'scan') {
      await rateLimit(req, 'scan', 120, 60_000)
      const body = await readJson<{ eventId?: string; payload?: string; deviceSessionId?: string; clientScanId?: string; source?: string; capturedOfflineAt?: string }>(req)
      const eventId = String(body.eventId ?? '')
      const access = await eventOrgAccess(user.id, eventId, 'checkin:scan')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Check-in requires check-in staff permissions for this event.')
      if (!body.payload || !body.clientScanId) throw errors.badRequest('payload and clientScanId are required.')
      const { processScan } = await import('@/server/services/checkin')
      const result = await processScan({
        eventId,
        scannerId: user.id,
        payload: String(body.payload),
        deviceSessionId: body.deviceSessionId ? String(body.deviceSessionId) : null,
        clientScanId: String(body.clientScanId),
        source: body.source === 'OFFLINE_SYNC' ? 'OFFLINE_SYNC' : 'ONLINE',
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
      const { processScan } = await import('@/server/services/checkin')
      const results: Awaited<ReturnType<typeof processScan>>[] = []
      for (const scan of scans) {
        results.push(
          await processScan({
            eventId,
            scannerId: user.id,
            payload: String(scan.payload ?? ''),
            deviceSessionId: body.deviceSessionId ? String(body.deviceSessionId) : null,
            clientScanId: String(scan.clientScanId ?? ''),
            source: 'OFFLINE_SYNC',
            capturedOfflineAt: scan.capturedOfflineAt,
          })
        )
      }
      if (body.deviceSessionId) {
        await db.deviceSession.update({ where: { id: String(body.deviceSessionId) }, data: { lastSyncAt: new Date() } }).catch(() => {})
      }
      return jsonOk({ synced: results.length, results })
    }

    throw errors.notFound('Unknown check-in action.')
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
      const sessions = await db.deviceSession.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take: 20 })
      return jsonOk({ items: sessions.map((s) => ({ ...s, tokenHash: undefined })) })
    }

    throw errors.notFound('Unknown check-in endpoint.')
  })
}
