import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, jsonList, pagination, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { getSession } from '@/server/auth'
import { verifyPlayback, issuePlayback, startBroadcast, endBroadcast, rotateStreamKey } from '@/server/services/broadcasts'

/**
 * Broadcasts:
 *  GET  list (mine / live / replays)
 *  POST create (schedule) — organizer
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const { page, pageSize, offset } = pagination(req, 15, 50)
    const mine = url.searchParams.get('mine') === '1'

    if (mine) {
      const user = await requireUser()
      const orgId = url.searchParams.get('orgId') ?? undefined
      const broadcasts = await db.liveBroadcast.findMany({
        where: { event: { orgId } },
        include: { event: { select: { id: true, title: true, slug: true, startsAt: true, orgId: true, org: { select: { name: true } } } } },
        orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
        take: 40,
      })
      // Filter to memberships the caller actually holds.
      const memberships = await db.membership.findMany({ where: { userId: user.id }, select: { orgId: true } })
      const myOrgs = new Set(memberships.map((m) => m.orgId))
      const items = broadcasts.filter((b) => myOrgs.has(b.event.orgId))
      return jsonOk({ items: items.map((b) => ({ ...b, streamKeyHash: undefined, ingestUrl: b.status === 'LIVE' ? '(active — visible in studio)' : b.ingestUrl })) })
    }

    const where = { status: 'LIVE', event: { visibility: 'PUBLIC', deletedAt: null } }
    const items = await db.liveBroadcast.findMany({
      where,
      include: { event: { select: { id: true, slug: true, title: true, coverImageUrl: true, org: { select: { name: true, slug: true } } } } },
      orderBy: { startedAt: 'desc' },
      skip: offset,
      take: pageSize,
    })
    const total = await db.liveBroadcast.count({ where })
    return jsonList(items, total, page, pageSize)
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)
    const eventId = String(body.eventId ?? '')
    const access = await eventOrgAccess(user.id, eventId, 'broadcast:manage')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('Broadcast management requires an organizer role.')
    const title = sanitizeText(body.title, 140) || 'Live broadcast'
    const accessPolicy = ['FREE', 'PAID', 'TICKET_HOLDERS', 'INVITED'].includes(String(body.accessPolicy)) ? String(body.accessPolicy) : 'FREE'
    const priceMinor = accessPolicy === 'PAID' ? Math.max(100, Math.round(Number(body.priceMinor ?? 1000))) : null
    // Optional replay override (PAID passes only): when omitted, replay access
    // follows the same pass/ticket-benefit rules as the live room. 0 = free replay.
    const replayPriceMinor =
      accessPolicy === 'PAID' && body.replayPriceMinor !== undefined && body.replayPriceMinor !== null && body.replayPriceMinor !== ''
        ? Math.max(0, Math.round(Number(body.replayPriceMinor)))
        : null
    const broadcast = await db.liveBroadcast.create({
      data: {
        eventId,
        title,
        description: sanitizeText(body.description, 500) || null,
        accessPolicy,
        priceMinor,
        replayPriceMinor,
        status: 'SCHEDULED',
        viewerCapacity: Math.max(50, Math.min(20000, Number(body.viewerCapacity ?? 500))),
        createdById: user.id,
      },
    })
    return jsonOk({ broadcast, note: 'Schedule created. Open the Streaming Studio to get the ingest key and go live.' })
  })
}
