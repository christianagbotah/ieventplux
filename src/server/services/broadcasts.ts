import { db } from '../../lib/db'
import { errors } from '../api'
import { playbackToken, streamKey } from '../ids'
import { sha256 } from '../auth'
import { env } from '../env'

/**
 * Live broadcasting: entitlement enforcement, short-lived protected playback
 * sessions, ingest key lifecycle. Delivery rides the video adapter —
 * Cloudflare Stream when configured, otherwise the explicitly-labelled
 * synthetic stream (see docs/PROVIDER_CAPABILITIES.md).
 */

const PLAYBACK_TTL_MS = 10 * 60 * 1000

export async function issuePlayback(params: { broadcastId: string; userId: string; ip?: string | null }) {
  const broadcast = await db.liveBroadcast.findUnique({ where: { id: params.broadcastId }, include: { event: true } })
  if (!broadcast) throw errors.notFound('Broadcast not found.')
  if (broadcast.status === 'ENDED') throw errors.conflict('This broadcast has ended. Replay availability is shown on the event page.')
  if (broadcast.status !== 'LIVE') throw errors.conflict('This broadcast is not live yet.')

  // Free broadcasts follow the event's privacy policy (public/unlisted/invited).
  const event = broadcast.event
  let entitlementId: string | null = null

  if (broadcast.accessPolicy !== 'FREE') {
    const entitlement = await resolveEntitlement(broadcast, params.userId)
    if (!entitlement) {
      throw new (await import('../api')).ApiError(
        'ENTITLEMENT_REQUIRED',
        broadcast.accessPolicy === 'PAID'
          ? 'This broadcast requires a paid viewing pass or a ticket that includes online access.'
          : broadcast.accessPolicy === 'TICKET_HOLDERS'
            ? 'This broadcast is for ticket holders whose ticket includes online access.'
            : 'This broadcast is invitation-only.',
        402
      )
    }
    if (entitlement.status !== 'ACTIVE') throw errors.forbidden('Your viewing access is no longer active.')
    if (entitlement.expiresAt && entitlement.expiresAt < new Date()) throw errors.forbidden('Your viewing pass has expired.')
    entitlementId = entitlement.id
  } else if (event.visibility === 'INVITE_ONLY') {
    const invited = await db.rsvp.findFirst({ where: { eventId: event.id, userId: params.userId, status: 'APPROVED' } })
    if (!invited) throw errors.forbidden('This broadcast is invitation-only.')
  }

  const token = playbackToken()
  const session = await db.playbackSession.create({
    data: {
      broadcastId: broadcast.id,
      userId: params.userId,
      entitlementId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + PLAYBACK_TTL_MS),
      ip: params.ip?.slice(0, 64) ?? null,
    },
  })
  return {
    playbackToken: token,
    expiresAt: session.expiresAt.toISOString(),
    delivery: env.videoProvider === 'simulator' ? ('SYNTHETIC' as const) : ('CLOUDFLARE_STREAM' as const),
    deliveryNote:
      env.videoProvider === 'simulator'
        ? 'Synthetic stream — Cloudflare Stream credentials are not configured; entitlement and session enforcement are fully active.'
        : 'Cloudflare Stream playback.',
  }
}

export async function verifyPlayback(broadcastId: string, token: string) {
  const session = await db.playbackSession.findUnique({ where: { tokenHash: sha256(token) } })
  if (!session || session.broadcastId !== broadcastId) return { ok: false, reason: 'INVALID' as const }
  if (session.revokedAt) return { ok: false, reason: 'REVOKED' as const }
  if (session.expiresAt < new Date()) return { ok: false, reason: 'EXPIRED' as const }
  await db.playbackSession.update({ where: { id: session.id }, data: { lastHeartbeatAt: new Date() } }).catch(() => {})
  return { ok: true as const, session }
}

export async function resolveEntitlement(broadcast: { id: string; eventId: string; accessPolicy: string; priceMinor: number | null }, userId: string) {
  const direct = await db.viewingEntitlement.findUnique({ where: { userId_broadcastId: { userId, broadcastId: broadcast.id } } })
  if (direct) return direct
  if (broadcast.accessPolicy === 'TICKET_HOLDERS') {
    // A ticket grants online access only when its product explicitly includes it.
    const ticket = await db.ticket.findFirst({
      where: { userId, eventId: broadcast.eventId, status: 'VALID', ticketType: { includesVirtualAccess: true } },
    })
    if (ticket) {
      return db.viewingEntitlement.create({
        data: { userId, broadcastId: broadcast.id, kind: 'TICKET_BENEFIT', status: 'ACTIVE', expiresAt: null },
      })
    }
    const virtualTicket = await db.ticket.findFirst({
      where: { userId, eventId: broadcast.eventId, status: 'VALID', ticketType: { kind: { in: ['VIRTUAL', 'HYBRID'] } } },
    })
    if (virtualTicket) {
      return db.viewingEntitlement.create({
        data: { userId, broadcastId: broadcast.id, kind: 'TICKET_BENEFIT', status: 'ACTIVE', expiresAt: null },
      })
    }
  }
  return null
}

export async function rotateStreamKey(broadcastId: string) {
  const key = streamKey()
  const ingestUrl =
    env.videoProvider === 'cloudflare-stream'
      ? `rtmp://live.cloudflare.com:443/live/${env.cfStream.accountId}` // verify input URI against current CF docs at integration time
      : `rtmp://simulated.local:1935/live`
  await db.liveBroadcast.update({
    where: { id: broadcastId },
    data: { ingestUrl, streamKeyId: `key-${Date.now()}`, streamKeyHash: sha256(key) },
  })
  return { ingestUrl, streamKey: key } // returned once to the organizer, never to attendees
}

export async function startBroadcast(broadcastId: string, userId: string) {
  const broadcast = await db.liveBroadcast.findUnique({ where: { id: broadcastId }, include: { event: true } })
  if (!broadcast) throw errors.notFound('Broadcast not found.')
  if (broadcast.status === 'LIVE') throw errors.conflict('Already live.')
  const result = await rotateStreamKey(broadcastId)
  await db.liveBroadcast.update({ where: { id: broadcastId }, data: { status: 'LIVE', startedAt: new Date() } })
  await db.event.update({ where: { id: broadcast.eventId }, data: { status: 'LIVE' } })
  // Notify entitled/following users.
  const followers = await db.follow.findMany({ where: { orgId: broadcast.event.orgId }, select: { followerId: true } })
  const { notifyUser } = await import('./notify')
  for (const f of followers.slice(0, 500)) {
    await notifyUser({
      userId: f.followerId,
      type: 'LIVE_STARTED',
      title: `${broadcast.event.title} is live now`,
      body: 'The broadcast has started. Join the stream.',
      link: `#/broadcast/${broadcast.id}`,
    }).catch(() => {})
  }
  return { ingestUrl: result.ingestUrl, streamKey: result.streamKey, simulated: env.videoProvider === 'simulator' }
}

export async function endBroadcast(broadcastId: string) {
  const broadcast = await db.liveBroadcast.findUnique({ where: { id: broadcastId } })
  if (!broadcast || broadcast.status !== 'LIVE') throw errors.conflict('Broadcast is not live.')
  const endedAt = new Date()
  const minutes = broadcast.startedAt ? Math.max(1, Math.round((endedAt.getTime() - broadcast.startedAt.getTime()) / 60000)) : 0
  await db.liveBroadcast.update({
    where: { id: broadcastId },
    data: { status: 'ENDED', endedAt, minutesUsed: minutes, recordingStatus: 'AVAILABLE' },
  })
  await db.event.update({ where: { id: broadcast.eventId }, data: { status: 'ENDED' } })
  await db.playbackSession.updateMany({ where: { broadcastId, revokedAt: null }, data: { revokedAt: endedAt } })
  return { minutes }
}
