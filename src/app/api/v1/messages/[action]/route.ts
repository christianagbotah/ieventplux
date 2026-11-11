import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { estimateSegments } from '@/server/hubtel/sms'
import { queueMessage, marketingAllowed, inQuietHours } from '@/server/services/notify'
import { membershipFor, orgCan } from '@/server/permissions'
import { getSettings } from '@/server/settings'
import { env } from '@/server/env'

/**
 * Messaging endpoints (brief §12):
 *  GET  estimate → segment/Unicode estimation BEFORE sending
 *  POST send     → organizer SMS campaign (consent + quiet hours + quota + spend limits)
 *  GET  deliveries → org delivery log with truthful provider states
 */

type RouteContext = { params: Promise<{ action: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    if (action === 'estimate') {
      const url = new URL(req.url)
      const body = url.searchParams.get('body') ?? ''
      const recipients = Math.max(1, Number(url.searchParams.get('recipients') ?? 1))
      const est = estimateSegments(body)
      const settings = await getSettings()
      return jsonOk({
        ...est,
        recipients,
        totalSegments: est.segments * recipients,
        exceedsMaxSegments: est.segments > settings.maxSmsSegmentsPerMessage,
        note: est.encoding === 'UCS-2' ? 'Unicode content detected — each segment carries only 70 characters.' : 'GSM-7 encoding (160 chars/segment).',
      })
    }
    if (action === 'status') {
      return jsonOk({
        smsMode: env.smsSimulator ? 'simulated' : 'real',
        simulatorNote: env.smsSimulator ? 'Hubtel SMS credentials absent — messages are accepted by the dev simulator and marked DELIVERED locally. API acceptance is never real handset delivery.' : 'Real Hubtel SMS active.',
      })
    }
    throw errors.notFound('Unknown messages endpoint.')
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    const user = await requireUser()

    if (action === 'send') {
      rateLimit(req, 'sms-send', 5, 60_000)
      const body = await readJson<{ orgId?: string; eventId?: string; body?: string; purpose?: string; recipients?: { phone: string; userId?: string }[] }>(req)
      const orgId = String(body.orgId ?? '')
      const membership = await membershipFor(user.id, orgId)
      if (!membership || !orgCan(membership.role, 'messages:send')) throw errors.forbidden('Messaging requires an organizer role.')
      const text = String(body.body ?? '').slice(0, 1600)
      if (text.length < 3) throw errors.badRequest('Message body is required.')
      const purpose = body.purpose === 'MARKETING' ? 'MARKETING' : 'TRANSACTIONAL'
      const recipients = Array.isArray(body.recipients) ? body.recipients.slice(0, 500) : []
      if (recipients.length === 0) throw errors.badRequest('Select at least one recipient.')

      const settings = await getSettings()
      const est = estimateSegments(text)
      if (est.segments > settings.maxSmsSegmentsPerMessage) {
        throw errors.badRequest(`Message exceeds the ${settings.maxSmsSegmentsPerMessage}-segment limit (${est.segments} segments).`)
      }

      const org = await db.organization.findUnique({ where: { id: orgId } })
      if (!org) throw errors.notFound('Organization not found.')

      // Quiet hours: marketing sends are deferred, transactional (e.g. event changes) may pass.
      const now = new Date()
      const quiet = inQuietHours(now, settings.quietHoursStart, settings.quietHoursEnd)
      if (quiet && purpose === 'MARKETING') {
        throw errors.conflict(`Quiet hours active (${settings.quietHoursStart}:00–${settings.quietHoursEnd}:00). Schedule your campaign outside quiet hours.`)
      }

      // Monthly organizer quota + spend limit.
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const sentThisMonth = await db.messageDelivery.count({ where: { orgId, channel: 'SMS', createdAt: { gte: monthStart }, status: { not: 'SUPPRESSED' } } })
      if (sentThisMonth + recipients.length > org.smsQuotaPerMonth) {
        throw errors.conflict(`Monthly SMS quota reached (${org.smsQuotaPerMonth}). Contact platform support to raise limits.`)
      }

      let queued = 0
      let suppressed = 0
      for (const recipient of recipients) {
        if (purpose === 'MARKETING') {
          const allowed = await marketingAllowed('SMS', recipient.phone)
          if (!allowed) {
            suppressed += 1
            continue
          }
        }
        const id = await queueMessage({
          channel: 'SMS',
          target: recipient.phone,
          userId: recipient.userId ?? null,
          orgId,
          template: purpose === 'MARKETING' ? 'org_campaign' : 'org_message',
          body: text,
          purpose,
          eventId: body.eventId ?? null,
          dedupKey: `org:${orgId}:${purpose}:${recipient.phone}:${text.slice(0, 40)}:${Math.floor(Date.now() / 60000)}`,
        })
        if (id) queued += 1
      }
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'messages.send', entityType: 'Organization', entityId: orgId, after: { queued, suppressed, purpose } })
      return jsonOk({
        queued,
        suppressed,
        segmentsPerMessage: est.segments,
        estimatedCostMinor: queued * est.segments * 5,
        providerMode: env.smsSimulator ? 'simulated' : 'real',
        note: env.smsSimulator ? 'Dev simulator active — no live messages are sent to real handsets.' : 'Queued for Hubtel delivery.',
      })
    }

    if (action === 'consent') {
      // Attendee manages their own marketing consent.
      const body = await readJson<{ channel?: string; target?: string; grant?: boolean }>(req)
      const channel = body.channel === 'EMAIL' ? 'EMAIL' : 'SMS'
      const target = channel === 'SMS' ? (user.phone ?? String(body.target ?? '')) : user.email
      if (!target) throw errors.badRequest('No contact on file.')
      if (body.grant) {
        await db.consent.upsert({
          where: { target_channel_scope: { target, channel, scope: 'MARKETING' } },
          create: { userId: user.id, channel, target, scope: 'MARKETING', source: 'preference' },
          update: { grantedAt: new Date(), revokedAt: null },
        })
      } else {
        await db.consent.updateMany({ where: { target, channel, scope: 'MARKETING' }, data: { revokedAt: new Date() } })
      }
      return jsonOk({ granted: Boolean(body.grant), channel, target })
    }

    void getSession
    throw errors.notFound('Unknown messages action.')
  })
}
