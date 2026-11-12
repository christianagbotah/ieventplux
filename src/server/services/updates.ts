import { db } from '../../lib/db'
import { errors, sanitizeText } from '../api'
import { eventOrgAccess } from '../permissions'
import { audit } from '../audit'
import { notifyUser, queueMessage } from './notify'
import { realtimeEmit } from './realtime'

/**
 * Organizer updates — the operational voice of an event (schedule changes,
 * venue notes, safety announcements) reaching every affected person honestly.
 *
 * Reach contract:
 *  - Audience = ticket holders ∪ fulfilled-order buyers ∪ organization
 *    followers, deduplicated by user. Nobody is notified twice.
 *  - In-app notifications are free and always sent.
 *  - SMS is reserved for updates marked `important` (real transactional need —
 *    time/venue/safety changes). Every send is durable (MessageDelivery + retry)
 *    and deduplicated per update+target.
 *  - Open event pages receive the update over the :3003 relay immediately
 *    (best-effort; the API remains the source of truth).
 *  - Guests (no account) who bought with a phone number are reached by SMS
 *    for important updates — they cannot receive in-app notifications.
 */

export interface EventUpdateView {
  id: string
  eventId: string
  title: string
  body: string
  important: boolean
  createdAt: string
}

const OPEN_FOR_UPDATES = ['PUBLISHED', 'SCHEDULED', 'LIVE', 'POSTPONED']
const MAX_POSTS_PER_HOUR = 6
const MAX_AUDIENCE_NOTIFY = 1000

function toView(u: { id: string; eventId: string; title: string; body: string; important: boolean; createdAt: Date }): EventUpdateView {
  return { id: u.id, eventId: u.eventId, title: u.title, body: u.body, important: u.important, createdAt: u.createdAt.toISOString() }
}

/** Public listing (newest first). The route layer already guarantees the event itself is visible. */
export async function listUpdates(eventId: string, take = 30): Promise<EventUpdateView[]> {
  const rows = await db.eventUpdate.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take })
  return rows.map(toView)
}

export interface PostUpdateInput {
  eventId: string
  userId: string
  actorLabel: string
  title: string
  body: string
  important: boolean
}

export interface PostUpdateResult {
  update: EventUpdateView
  reach: {
    audience: number // distinct people in the reachable set (signed-in)
    notified: number // in-app notifications created
    smsQueued: number // durable SMS messages queued (important only)
  }
}

export async function postUpdate(input: PostUpdateInput): Promise<PostUpdateResult> {
  const access = await eventOrgAccess(input.userId, input.eventId, 'event:edit')
  if (!access.event) throw errors.notFound('Event not found.')
  if (!access.allowed) throw errors.forbidden('You do not have permission to post updates.')
  if (!OPEN_FOR_UPDATES.includes(access.event.status)) {
    throw errors.conflict('Updates can only be posted while an event is published, scheduled, live or postponed.')
  }

  const title = sanitizeText(input.title, 160)
  const body = sanitizeText(input.body, 2000)
  if (!title || !body) throw errors.badRequest('Title and body are required.')
  const important = Boolean(input.important)

  // Rate guard: an event page should never become a firehose.
  const since = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await db.eventUpdate.count({ where: { eventId: input.eventId, createdAt: { gte: since } } })
  if (recent >= MAX_POSTS_PER_HOUR) {
    throw errors.conflict(`Update limit reached (${MAX_POSTS_PER_HOUR}/hour). Wait a moment before posting again.`)
  }

  const update = await db.eventUpdate.create({
    data: { eventId: input.eventId, orgId: access.event.orgId, title, body, important },
  })

  await audit({
    actorUserId: input.userId,
    actorLabel: input.actorLabel,
    action: 'event.update.post',
    entityType: 'EventUpdate',
    entityId: update.id,
    after: { title, important },
  })

  // ── Audience: ticket holders ∪ fulfilled buyers ∪ followers (dedup by user) ──
  const [holderRows, buyerRows, followerRows] = await Promise.all([
    db.ticket.findMany({ where: { eventId: input.eventId, status: 'VALID' }, select: { userId: true }, distinct: ['userId'] }),
    db.order.findMany({ where: { eventId: input.eventId, status: 'PAID' }, select: { userId: true } }),
    db.follow.findMany({ where: { orgId: access.event.orgId }, select: { followerId: true } }),
  ])
  const audience = new Set<string>()
  for (const h of holderRows) if (h.userId) audience.add(h.userId)
  for (const b of buyerRows) if (b.userId) audience.add(b.userId)
  for (const f of followerRows) audience.add(f.followerId)
  audience.delete(input.userId) // the author is never notified about their own post

  const link = `#/event/${input.eventId}`
  let notified = 0
  const notifyTitle = important ? `Important update — ${title}` : title
  for (const userId of audience) {
    if (notified >= MAX_AUDIENCE_NOTIFY) break
    await notifyUser({ userId, type: 'EVENT_CHANGE', title: notifyTitle, body: body.slice(0, 200), link }).catch(() => {})
    notified += 1
  }

  // ── SMS for important updates (durable, deduped, TRANSACTIONAL) ──────────────
  let smsQueued = 0
  if (important) {
    const smsTargets = new Map<string, string>() // target -> label for nothing else, just dedup
    // Signed-in audience members with a phone on file.
    const users = await db.user.findMany({
      where: { id: { in: [...audience].slice(0, MAX_AUDIENCE_NOTIFY) }, phone: { not: null } },
      select: { id: true, phone: true },
    })
    for (const u of users) if (u.phone) smsTargets.set(u.phone, u.id)
    // Guest buyers (no account) who left a phone number — they cannot be reached in-app.
    const guestBuyers = await db.order.findMany({
      where: { eventId: input.eventId, status: 'PAID', userId: null, buyerPhone: { not: null } },
      select: { buyerPhone: true },
    })
    for (const g of guestBuyers) if (g.buyerPhone) smsTargets.set(g.buyerPhone, '')
    const smsBody = `iEventPlux — ${title}: ${body.slice(0, 120)}${body.length > 120 ? '…' : ''}`
    for (const [phone, uid] of smsTargets) {
      const queued = await queueMessage({
        channel: 'SMS',
        target: phone,
        userId: uid || null,
        orgId: access.event.orgId,
        template: 'event_update_important',
        body: smsBody,
        purpose: 'TRANSACTIONAL',
        dedupKey: `evupd:${update.id}:${phone}`,
        eventId: input.eventId,
      }).catch(() => null)
      if (queued) smsQueued += 1
    }
  }

  // ── Realtime: anyone with the event page open sees it immediately ────────────
  await realtimeEmit(`event:${input.eventId}`, 'update:new', { update: toView(update) }).catch(() => {})

  return { update: toView(update), reach: { audience: audience.size, notified, smsQueued } }
}

export async function deleteUpdate(updateId: string, userId: string, actorLabel: string, expectedEventId?: string): Promise<{ deleted: true }> {
  const update = await db.eventUpdate.findUnique({ where: { id: updateId }, select: { id: true, eventId: true, title: true } })
  if (!update || (expectedEventId && update.eventId !== expectedEventId)) throw errors.notFound('Update not found.')
  const access = await eventOrgAccess(userId, update.eventId, 'event:edit')
  if (!access.event) throw errors.notFound('Event not found.')
  if (!access.allowed) throw errors.forbidden('You do not have permission to manage updates.')

  await db.eventUpdate.delete({ where: { id: updateId } })
  await audit({ actorUserId: userId, actorLabel, action: 'event.update.delete', entityType: 'EventUpdate', entityId: updateId, before: { title: update.title } })
  await realtimeEmit(`event:${update.eventId}`, 'update:removed', { updateId }).catch(() => {})
  return { deleted: true }
}
