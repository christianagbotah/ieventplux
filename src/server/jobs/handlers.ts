import { db } from '../../lib/db'
import { env } from '../env'
import { sendSms, checkSmsDelivery } from '../hubtel/sms'
import { checkSendMoneyStatus } from '../hubtel/payments'
import { processProviderEvent, reconcilePayments } from '../services/payments'
import { releaseExpiredReservations } from '../services/ordering'
import { notifyUser } from '../services/notify'
import { runWaitlistJob } from '../services/waitlist'
import { markPayoutPaid, failPayout } from '../services/refunds'

/**
 * Background job handlers — executed by the worker mini-service (:3001).
 * Every handler is idempotent; retries never duplicate paid effects.
 */

type JobPayload = Record<string, unknown>

export async function runJob(type: string, payload: JobPayload): Promise<{ detail: string }> {
  switch (type) {
    case 'PROCESS_PROVIDER_EVENT': {
      const result = await processProviderEvent(String(payload.providerEventId))
      return { detail: JSON.stringify(result) }
    }
    case 'RECONCILE_PAYMENT': {
      const result = await reconcilePayments()
      return { detail: `checked=${result.checked}` }
    }
    case 'RESERVATION_SWEEP': {
      const result = await releaseExpiredReservations()
      return { detail: `released=${result.released} expiredOrders=${result.ordersExpired}` }
    }
    case 'SEND_MESSAGE': {
      return { detail: await handleSendMessage(payload) }
    }
    case 'SMS_STATUS_POLL': {
      return { detail: await handleSmsStatusPoll() }
    }
    case 'REMINDER_SWEEP': {
      return { detail: await handleReminders() }
    }
    case 'PAYOUT_STATUS_POLL': {
      return { detail: await handlePayoutStatusPoll() }
    }
    case 'EVENT_LIFECYCLE': {
      return { detail: await handleEventLifecycle() }
    }
    case 'PLAYBACK_CLEANUP': {
      const cutoff = new Date(Date.now() - 30 * 60_000)
      const result = await db.playbackSession.updateMany({ where: { expiresAt: { lt: cutoff }, revokedAt: null }, data: { revokedAt: new Date() } })
      return { detail: `revoked=${result.count}` }
    }
    case 'NOTIFY_PUSH': {
      const userId = String(payload.userId ?? '')
      if (userId) {
        await notifyUser({
          userId,
          type: String(payload.type ?? 'SYSTEM'),
          title: String(payload.title ?? ''),
          body: String(payload.body ?? ''),
          link: payload.link ? String(payload.link) : undefined,
        })
      }
      return { detail: 'pushed' }
    }
    case 'WAITLIST_PROMOTE': {
      return await runWaitlistJob({ eventId: payload.eventId ? String(payload.eventId) : undefined })
    }
    case 'WAITLIST_SWEEP': {
      return await runWaitlistJob({})
    }
    default:
      return { detail: `Unknown job type ${type}` }
  }
}

async function handleSendMessage(payload: JobPayload): Promise<string> {
  const id = String(payload.messageDeliveryId ?? '')
  const message = await db.messageDelivery.findUnique({ where: { id } })
  if (!message) return 'missing'
  if (['DELIVERED', 'SENT', 'SUPPRESSED'].includes(message.status)) return `already_${message.status.toLowerCase()}`

  if (message.channel === 'SMS') {
    if (message.purpose === 'MARKETING') {
      const { marketingAllowed } = await import('../services/notify')
      const allowed = await marketingAllowed('SMS', message.target)
      if (!allowed) {
        await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'SUPPRESSED', failureReason: 'Marketing consent not granted' } })
        return 'suppressed_no_consent'
      }
    }
    const result = await sendSms({ to: message.target, body: message.body, purpose: message.purpose })
    if (result.ok) {
      // Provider ACCEPTED the message — this is NOT handset delivery (documented rule).
      await db.messageDelivery.update({
        where: { id: message.id },
        data: { status: 'ACCEPTED', provider: result.provider, providerMessageId: result.messageId, sentAt: new Date(), attempts: { increment: 1 } },
      })
      await db.outboxJob.create({ data: { type: 'SMS_STATUS_POLL', payload: '{}', runAt: new Date(Date.now() + 8000) } })
      return 'accepted'
    }
    await db.messageDelivery.update({
      where: { id: message.id },
      data: { status: 'FAILED', failureReason: result.error?.slice(0, 300), attempts: { increment: 1 } },
    })
    return 'failed'
  }

  if (message.channel === 'EMAIL') {
    if (!env.smtp.host) {
      await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'SUPPRESSED', failureReason: 'SMTP not configured' } })
      return 'suppressed_no_smtp'
    }
    try {
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.createTransport({ host: env.smtp.host, port: env.smtp.port, auth: { user: env.smtp.user, pass: env.smtp.pass } })
      await transport.sendMail({ from: env.smtp.from, to: message.target, subject: message.subject ?? 'iEventPlux', text: message.body })
      await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'DELIVERED', provider: 'SMTP', sentAt: new Date(), deliveredAt: new Date(), attempts: { increment: 1 } } })
      return 'sent'
    } catch (err) {
      await db.messageDelivery.update({
        where: { id: message.id },
        data: { status: 'FAILED', failureReason: err instanceof Error ? err.message.slice(0, 300) : 'SMTP error', attempts: { increment: 1 } },
      })
      return 'smtp_failed'
    }
  }

  // INAPP messages are covered by the notifications table.
  await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
  return 'inapp'
}

async function handleSmsStatusPoll(): Promise<string> {
  const pending = await db.messageDelivery.findMany({
    where: { channel: 'SMS', status: 'ACCEPTED', providerMessageId: { not: null } },
    take: 50,
  })
  let delivered = 0
  let failed = 0
  for (const message of pending) {
    if (!message.providerMessageId) continue
    if (message.provider === 'SIMULATOR') {
      // Dev simulator transitions ACCEPTED → DELIVERED after a short delay (explicitly labelled synthetic).
      if (message.sentAt && Date.now() - message.sentAt.getTime() > 4000) {
        await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), failureReason: 'Simulated delivery (dev simulator)' } })
        delivered += 1
      }
      continue
    }
    const state = await checkSmsDelivery(message.providerMessageId)
    if (state.state === 'DELIVERED') {
      await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
      delivered += 1
    } else if (state.state === 'FAILED') {
      await db.messageDelivery.update({ where: { id: message.id }, data: { status: 'FAILED', failureReason: state.detail?.slice(0, 300) } })
      failed += 1
    }
  }
  return `delivered=${delivered} failed=${failed} pending=${pending.length - delivered - failed}`
}

async function handleReminders(): Promise<string> {
  const now = new Date()
  const soon = new Date(now.getTime() + 24 * 3600_000)
  const events = await db.event.findMany({
    where: { status: 'PUBLISHED', startsAt: { gte: now, lte: soon }, deletedAt: null },
    select: { id: true, title: true, startsAt: true, slug: true },
  })
  let sent = 0
  let optins = 0
  for (const event of events) {
    const key = `reminder:${event.id}:${event.startsAt.toISOString().slice(0, 10)}`
    const marker = await db.platformSetting.findUnique({ where: { key: `reminder:${key}` } })
    if (marker) continue
    const tickets = await db.ticket.findMany({ where: { eventId: event.id, status: 'VALID' }, select: { userId: true }, distinct: ['userId'] })
    for (const t of tickets.slice(0, 2000)) {
      if (!t.userId) continue
      await notifyUser({ userId: t.userId, type: 'REMINDER', title: `Coming up: ${event.title}`, body: 'Your event starts within 24 hours.', link: '#/me?tab=tickets' }).catch(() => {})
      sent += 1
    }
    // Round 15: explicit "Remind me" opt-ins who do NOT hold a ticket for this
    // event. Ticket holders were just notified above, so they are excluded here.
    const holderIds = new Set(tickets.map((t) => t.userId).filter(Boolean) as string[])
    const optInRows = await db.eventReminder.findMany({ where: { eventId: event.id }, select: { userId: true }, take: 2000 })
    for (const row of optInRows) {
      if (holderIds.has(row.userId)) continue
      await notifyUser({
        userId: row.userId,
        type: 'REMINDER',
        title: `Starting soon: ${event.title}`,
        body: 'This event starts within 24 hours — grab a ticket while some are left.',
        link: `#/event/${event.slug}`,
      }).catch(() => {})
      optins += 1
    }
    await db.platformSetting.create({ data: { key: `reminder:${key}`, value: '1' } }).catch(() => {})
  }
  return `reminders=${sent} optins=${optins}`
}

/**
 * Round 15: Send Money payout status poll. SUBMITTED payouts are polled
 * against the provider; SUCCESS marks PAID (hold released), FAILED reverses
 * the journal and releases the hold, and an unverified/unreachable endpoint
 * NEVER produces a verdict — the payout stays SUBMITTED with the poll note for
 * manual confirmation. Bounded to 20 checks per payout, then it stops polling
 * and stays awaiting manual action (honest, not fake-final).
 */
async function handlePayoutStatusPoll(): Promise<string> {
  const candidates = await db.payout.findMany({
    where: {
      status: 'SUBMITTED',
      providerRef: { not: null },
      statusCheckCount: { lt: 20 },
      submittedAt: { lt: new Date(Date.now() - 45_000) },
    },
    take: 25,
  })
  let paid = 0
  let failed = 0
  let pending = 0
  let blocked = 0
  for (const payout of candidates) {
    const ref = payout.providerRef as string
    const result = await checkSendMoneyStatus(ref)
    await db.payout.update({
      where: { id: payout.id },
      data: { statusCheckCount: { increment: 1 }, lastStatusCheckAt: new Date() },
    })
    if (result.ok && result.outcome === 'SUCCESS') {
      await markPayoutPaid(payout.id)
      const { notifyOrgOwnerPayout } = await import('../services/refunds')
      await notifyOrgOwnerPayout(payout.id, 'paid').catch(() => {})
      paid += 1
    } else if (result.ok && result.outcome === 'FAILED') {
      await failPayout(payout.id, result.detail?.slice(0, 300) ?? 'Provider reported transfer failure')
      const { notifyOrgOwnerPayout } = await import('../services/refunds')
      await notifyOrgOwnerPayout(payout.id, 'failed').catch(() => {})
      failed += 1
    } else if (result.ok) {
      pending += 1
    } else {
      // Unknown — record the poll note but never a verdict; manual confirm remains.
      await db.payout.update({ where: { id: payout.id }, data: { failureReason: result.detail?.slice(0, 300) } })
      blocked += 1
    }
  }
  return `checked=${candidates.length} paid=${paid} failed=${failed} pending=${pending} blocked=${blocked}`
}

async function handleEventLifecycle(): Promise<string> {
  const now = new Date()
  // Scheduled publication.
  const toPublish = await db.event.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: now } }, select: { id: true } })
  for (const e of toPublish) {
    await db.event.update({ where: { id: e.id }, data: { status: 'PUBLISHED', publishedAt: now } })
  }
  // Auto-end events past their end time (+30 min grace).
  const endedCutoff = new Date(now.getTime() - 30 * 60_000)
  const toEnd = await db.event.findMany({ where: { status: { in: ['PUBLISHED', 'LIVE'] }, endsAt: { lt: endedCutoff } }, select: { id: true } })
  for (const e of toEnd) {
    await db.event.update({ where: { id: e.id }, data: { status: 'ENDED' } })
    await db.liveBroadcast.updateMany({ where: { eventId: e.id, status: 'LIVE' }, data: { status: 'ENDED', endedAt: now } })
  }
  // Promotion schedule transitions.
  const campaigns = await db.promotionCampaign.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: now } }, select: { id: true } })
  for (const c of campaigns) {
    await db.promotionCampaign.update({ where: { id: c.id }, data: { status: 'RUNNING' } })
  }
  const doneCampaigns = await db.promotionCampaign.findMany({ where: { status: 'RUNNING', endsAt: { lt: now } }, select: { id: true } })
  for (const c of doneCampaigns) {
    await db.promotionCampaign.update({ where: { id: c.id }, data: { status: 'COMPLETED' } })
  }
  return `published=${toPublish.length} ended=${toEnd.length} campaigns=${campaigns.length}`
}

/** Direct invocation helper for admin "run now" controls. */
export async function sweepOnce(sweep: 'reconcile' | 'reservations' | 'reminders' | 'lifecycle' | 'sms' | 'payouts') {
  switch (sweep) {
    case 'reconcile':
      return reconcilePayments()
    case 'reservations':
      return releaseExpiredReservations()
    case 'reminders':
      return { detail: await handleReminders() }
    case 'lifecycle':
      return { detail: await handleEventLifecycle() }
    case 'sms':
      return { detail: await handleSmsStatusPoll() }
    case 'payouts':
      return { detail: await handlePayoutStatusPoll() }
  }
}
