import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { issuePlayback, verifyPlayback, startBroadcast, endBroadcast, rotateStreamKey, resolveEntitlement } from '@/server/services/broadcasts'
import { env } from '@/server/env'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * Broadcast sub-actions:
 *  GET  chat           → chat history (moderated, VISIBLE only)
 *  POST chat           → send chat message (rate-limited)
 *  POST play           → entitlement check + short-lived playback token (10 min)
 *  POST heartbeat      → keep playback session alive
 *  POST start / end / rotate-key → organizer studio operations
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params

    if (action === 'chat') {
      const { page, pageSize, offset } = pagination(req, 40, 100)
      const messages = await db.chatMessage.findMany({
        where: { broadcastId: id, status: 'VISIBLE' },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.chatMessage.count({ where: { broadcastId: id, status: 'VISIBLE' } })
      return jsonList(messages.reverse(), total, page, pageSize)
    }

    if (action === 'detail') {
      const broadcast = await db.liveBroadcast.findUnique({
        where: { id },
        include: { event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, coverImageUrl: true, org: { select: { name: true, slug: true } }, visibility: true } } },
      })
      if (!broadcast) throw errors.notFound('Broadcast not found.')
      const session = await (await import('@/server/auth')).getSession()
      let access: { allowed: boolean; reason?: string; requires?: string } = { allowed: broadcast.accessPolicy === 'FREE' }
      if (session && !access.allowed) {
        const entitlement = await resolveEntitlement(broadcast, session.user.id)
        if (entitlement && entitlement.status === 'ACTIVE' && (!entitlement.expiresAt || entitlement.expiresAt > new Date())) access = { allowed: true }
        else access = { allowed: false, reason: 'expired_or_revoked' }
      } else if (!access.allowed) {
        access = { allowed: false, reason: 'sign_in_required', requires: broadcast.accessPolicy }
      }
      // Ingest details never go to attendees — only org staff.
      let ingest: { url: string; key: string } | null = null
      if (session) {
        const access2 = await eventOrgAccess(session.user.id, broadcast.eventId, 'broadcast:manage')
        if (access2.allowed && broadcast.status === 'LIVE') {
          const rotated = await rotateStreamKey(id)
          ingest = { url: rotated.ingestUrl, key: rotated.streamKey }
        }
      }
      return jsonOk({
        broadcast: { ...broadcast, streamKeyHash: undefined, ingestUrl: undefined },
        access,
        ingest,
        delivery: env.videoProvider === 'simulator' ? 'SYNTHETIC' : 'CLOUDFLARE_STREAM',
        deliveryNote:
          env.videoProvider === 'simulator'
            ? 'Synthetic stream — Cloudflare Stream credentials are not configured. Entitlement, tokens and session enforcement are fully active.'
            : 'Cloudflare Stream playback.',
      })
    }

    throw errors.notFound('Unknown broadcast endpoint.')
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>)

    if (action === 'play') {
      rateLimit(req, 'playback', 30, 60_000)
      const result = await issuePlayback({ broadcastId: id, userId: user.id, ip: req.headers.get('x-forwarded-for') ?? undefined })
      return jsonOk(result)
    }

    if (action === 'verify') {
      const token = String(body.token ?? '')
      const result = await verifyPlayback(id, token)
      if (!result.ok) throw errors.forbidden(`Playback session ${result.reason.toLowerCase()}.`)
      return jsonOk({ valid: true })
    }

    if (action === 'heartbeat') {
      const token = String(body.token ?? '')
      const result = await verifyPlayback(id, token)
      if (!result.ok) throw errors.forbidden(`Playback session ${result.reason.toLowerCase()}.`)
      const session = await db.playbackSession.findUnique({ where: { id: result.session?.id ?? '' } })
      return jsonOk({ alive: true, expiresAt: session?.expiresAt })
    }

    if (action === 'chat') {
      rateLimit(req, 'chat', 15, 60_000)
      const text = (await import('@/server/api')).sanitizeText(body.body, 400)
      if (text.length < 1) throw errors.badRequest('Message is empty.')
      const broadcast = await db.liveBroadcast.findUnique({ where: { id } })
      if (!broadcast || broadcast.status !== 'LIVE') throw errors.conflict('Chat is only available during live broadcasts.')
      const message = await db.chatMessage.create({
        data: { broadcastId: id, userId: user.id, orgId: (await db.event.findUnique({ where: { id: broadcast.eventId }, select: { orgId: true } }))?.orgId ?? null, body: text },
      })
      return jsonOk({ message: { ...message, user: { id: user.id, displayName: user.displayName } } })
    }

    if (action === 'start') {
      const result = await startBroadcast(id, user.id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'broadcast.start', entityType: 'LiveBroadcast', entityId: id })
      return jsonOk({ ...result, simulated: env.videoProvider === 'simulator', note: env.videoProvider === 'simulator' ? 'Synthetic delivery active (no Cloudflare Stream credentials). Entitlements fully enforced.' : undefined })
    }

    if (action === 'end') {
      const result = await endBroadcast(id)
      return jsonOk({ ...result, note: 'Broadcast ended. Replay is being prepared when recording is enabled.' })
    }

    if (action === 'rotate-key') {
      const broadcast = await db.liveBroadcast.findUnique({ where: { id } })
      if (!broadcast) throw errors.notFound('Broadcast not found.')
      const access = await eventOrgAccess(user.id, broadcast.eventId, 'broadcast:manage')
      if (!access.allowed) throw errors.forbidden('Stream keys are organizer-only.')
      const rotated = await rotateStreamKey(id)
      return jsonOk({ ingestUrl: rotated.ingestUrl, streamKey: rotated.streamKey, note: 'Previous key revoked. Update OBS/vMix before your next broadcast.' })
    }

    throw errors.notFound('Unknown broadcast action.')
  })
}
