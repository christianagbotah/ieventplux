import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { issuePlayback, verifyPlayback, startBroadcast, endBroadcast, rotateStreamKey, resolveEntitlement, moderateChatMessage } from '@/server/services/broadcasts'
import { realtimeEmit } from '@/server/services/realtime'
import { env } from '@/server/env'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/** Organizer gate for studio operations (start/end/rotate/chat moderation). */
async function requireBroadcastManage(broadcastId: string, userId: string) {
  const broadcast = await db.liveBroadcast.findUnique({ where: { id: broadcastId }, select: { id: true, eventId: true, status: true } })
  if (!broadcast) throw errors.notFound('Broadcast not found.')
  const access = await eventOrgAccess(userId, broadcast.eventId, 'broadcast:manage')
  if (!access.allowed) throw errors.forbidden('Broadcast control is organizer-only.')
  return broadcast
}

/**
 * Broadcast sub-actions:
 *  GET  chat           → chat history (viewers: VISIBLE only · organizers: all statuses)
 *  POST chat           → send chat message (rate-limited)
 *  POST play           → entitlement check + short-lived playback token (10 min; replay or live)
 *  POST heartbeat      → keep playback session alive
 *  POST chat-moderate  → organizer hide/flag/restore a chat message
 *  POST start / end / rotate-key → organizer studio operations (org-gated)
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params

    if (action === 'chat') {
      const { page, pageSize, offset } = pagination(req, 40, 100)
      // Viewers read VISIBLE only. Organizers (broadcast:manage) see the full
      // moderation ledger — HIDDEN and FLAGGED rows included, with status labels.
      const session = await (await import('@/server/auth')).getSession()
      let organizer = false
      if (session) {
        const broadcast = await db.liveBroadcast.findUnique({ where: { id }, select: { eventId: true } })
        if (broadcast) organizer = (await eventOrgAccess(session.user.id, broadcast.eventId, 'broadcast:manage')).allowed
      }
      const statusFilter = organizer ? undefined : 'VISIBLE'
      const messages = await db.chatMessage.findMany({
        where: { broadcastId: id, ...(statusFilter ? { status: statusFilter } : {}) },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.chatMessage.count({ where: { broadcastId: id, ...(statusFilter ? { status: statusFilter } : {}) } })
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
      // Replay surface: an ENDED broadcast with a ready recording plays back on
      // demand (same access policy as live; capacity does not apply to replays).
      // replayPriceMinor overrides the pass price for on-demand viewing; when
      // unset the live-pass price/ticket-benefit rules carry over.
      const isReplay = broadcast.status === 'ENDED'
      const replayEffectiveMinor = broadcast.replayPriceMinor ?? broadcast.priceMinor
      const replay = {
        available: isReplay && broadcast.recordingStatus === 'AVAILABLE',
        effectivePriceMinor: isReplay ? replayEffectiveMinor : null,
      }
      // Ingest credentials are NEVER shown here: the raw stream key is only
      // revealed once, by the explicit start/rotate-key organizer actions.
      // (Detail previously auto-rotated on every organizer page load while LIVE —
      // killing a running OBS uplink mid-stream. Fixed this round.)
      return jsonOk({
        broadcast: { ...broadcast, streamKeyHash: undefined, ingestUrl: undefined },
        access,
        ingest: null,
        replay,
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
      const relayed = { ...message, user: { id: user.id, displayName: user.displayName } }
      // Relay the *confirmed* message to everyone in the broadcast room
      // (the sender included — clients dedupe by id and also append locally).
      await realtimeEmit(`broadcast:${id}`, 'chat', relayed)
      return jsonOk({ message: relayed })
    }

    if (action === 'start') {
      await requireBroadcastManage(id, user.id)
      const result = await startBroadcast(id, user.id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'broadcast.start', entityType: 'LiveBroadcast', entityId: id })
      return jsonOk({ ...result, simulated: env.videoProvider === 'simulator', note: env.videoProvider === 'simulator' ? 'Synthetic delivery active (no Cloudflare Stream credentials). Entitlements fully enforced.' : undefined })
    }

    if (action === 'end') {
      await requireBroadcastManage(id, user.id)
      const result = await endBroadcast(id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'broadcast.end', entityType: 'LiveBroadcast', entityId: id })
      return jsonOk({ ...result, note: 'Broadcast ended. The replay is available immediately for entitled viewers.' })
    }

    if (action === 'rotate-key') {
      await requireBroadcastManage(id, user.id)
      const broadcast = await db.liveBroadcast.findUnique({ where: { id } })
      if (!broadcast) throw errors.notFound('Broadcast not found.')
      const rotated = await rotateStreamKey(id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'broadcast.rotate_key', entityType: 'LiveBroadcast', entityId: id })
      return jsonOk({ ingestUrl: rotated.ingestUrl, streamKey: rotated.streamKey, note: 'Previous key revoked. Update OBS/vMix before your next broadcast.' })
    }

    if (action === 'chat-moderate') {
      // Organizer-only moderation: hide / flag / restore a chat message.
      // The viewer feed receives a realtime chat:moderated event so removals
      // land without a refresh (GET history already filters by status).
      await requireBroadcastManage(id, user.id)
      rateLimit(req, 'chat-moderate', 60, 60_000)
      const messageId = String(body.messageId ?? '')
      const status = String(body.status ?? '')
      if (!messageId) throw errors.badRequest('messageId is required.')
      const message = await moderateChatMessage({ broadcastId: id, messageId, status })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `broadcast.chat_${status.toLowerCase()}`, entityType: 'ChatMessage', entityId: messageId, after: { broadcastId: id, status } })
      return jsonOk({ message })
    }

    throw errors.notFound('Unknown broadcast action.')
  })
}
