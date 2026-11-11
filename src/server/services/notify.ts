import { db } from '../../lib/db'
import { env } from '../env'
import { enqueue } from '../outbox'
import { estimateSegments } from '../hubtel/sms'

/**
 * Notifications + durable message queue (SMS/email/in-app) with deduplication,
 * bounded retries and truthful provider states. See docs/OPERATIONS.md.
 */

export async function notifyUser(params: { userId: string; type: string; title: string; body: string; link?: string }) {
  const row = await db.notification.create({
    data: { userId: params.userId, type: params.type, title: params.title.slice(0, 160), body: params.body.slice(0, 800), link: params.link ?? null },
  })
  // Realtime push (best-effort; the notification remains in the DB either way).
  try {
    await fetch(`http://localhost:${env.realtime.port}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Realtime-Secret': env.realtime.secret },
      body: JSON.stringify({ room: `user:${params.userId}`, event: 'notification', payload: { id: row.id, type: row.type, title: row.title, body: row.body, link: row.link } }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Realtime service down — notification is still durable in the database.
  }
  return row
}

export interface QueueMessageInput {
  channel: 'SMS' | 'EMAIL' | 'INAPP'
  target: string
  userId?: string | null
  orgId?: string | null
  template: string
  subject?: string
  body: string
  purpose: 'TRANSACTIONAL' | 'REMINDER' | 'MARKETING'
  dedupKey?: string
  eventId?: string | null
}

/** Queue a message for durable delivery. Returns the MessageDelivery id (or null on dedup hit). */
export async function queueMessage(input: QueueMessageInput): Promise<string | null> {
  if (input.dedupKey) {
    const existing = await db.messageDelivery.findUnique({ where: { dedupKey: input.dedupKey } })
    if (existing) return null
  }
  const segments = input.channel === 'SMS' ? estimateSegments(input.body).segments : null
  const provider =
    input.channel === 'INAPP' ? 'INAPP' : input.channel === 'SMS' ? (env.smsSimulator ? 'SIMULATOR' : 'HUBTEL') : env.smtp.host ? 'SMTP' : 'SMTP'
  const row = await db.messageDelivery.create({
    data: {
      channel: input.channel,
      target: input.target,
      userId: input.userId ?? null,
      orgId: input.orgId ?? null,
      template: input.template,
      subject: input.subject?.slice(0, 200) ?? null,
      body: input.body.slice(0, 1600),
      purpose: input.purpose,
      status: 'QUEUED',
      provider,
      segmentsCount: segments,
      dedupKey: input.dedupKey ?? null,
    },
  })
  await enqueue('SEND_MESSAGE', { messageDeliveryId: row.id })
  return row.id
}

/** Suppress marketing sends when consent is revoked / never granted. */
export async function marketingAllowed(channel: 'SMS' | 'EMAIL', target: string): Promise<boolean> {
  const consent = await db.consent.findUnique({ where: { target_channel_scope: { target, channel, scope: 'MARKETING' } } })
  return Boolean(consent && !consent.revokedAt)
}

/** Quiet hours check (organizer/recipient local time; Ghana has no DST). */
export function inQuietHours(date: Date, startHour: number, endHour: number, timezone = 'Africa/Accra'): boolean {
  try {
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date)
    const hour = Number(local)
    if (startHour > endHour) return hour >= startHour || hour < endHour // e.g. 20→08
    return hour >= startHour && hour < endHour
  } catch {
    return false
  }
}
