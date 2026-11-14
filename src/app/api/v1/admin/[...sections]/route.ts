import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { platformCan } from '@/server/permissions'
import { integrationStatuses, envValidation, env } from '@/server/env'
import { sweepOnce } from '@/server/jobs/handlers'

/**
 * Platform administration API (staff-only, narrowly scoped, audited):
 *
 * GET  overview | users | orgs | events | moderation | fees | plans | payments | refunds | payouts | sms | audit | integrations | outbox | settings | categories | ops
 * POST orgs/:id/verify | events/:id/suspend | moderation/:id/action | fees | plans | payouts/:id/submit|paid|fail | refunds/:id/process|approve|reject | settings | sweeps/:kind | categories (create) | categories/:id/update|delete | ops/check (run the health cycle now)
 */
type RouteContext = { params: Promise<{ sections: string[] }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { sections } = await ctx.params
    const [root] = sections
    const user = await requireUser()
    if (!platformCan(user.role, 'admin:console')) throw errors.forbidden('Platform administration access required.')
    const url = new URL(req.url)

    if (root === 'overview') {
      const [users, orgs, events, orders, tickets, broadcasts, payouts, refundCases, reports, smsPending, exceptions, revenue, fees] = await Promise.all([
        db.user.count(),
        db.organization.count({ where: { deletedAt: null } }),
        db.event.count({ where: { deletedAt: null } }),
        db.order.count(),
        db.ticket.count(),
        db.liveBroadcast.count(),
        db.payout.count({ where: { status: 'REQUESTED' } }),
        db.refundCase.count({ where: { status: 'REQUESTED' } }),
        db.moderationReport.count({ where: { status: 'OPEN' } }),
        db.messageDelivery.count({ where: { status: { in: ['QUEUED', 'ACCEPTED'] } } }),
        db.paymentAttempt.count({ where: { status: { in: ['UNKNOWN', 'EXCEPTION_REVIEW'] } } }),
        db.order.aggregate({ where: { status: 'PAID' }, _sum: { totalMinor: true } }),
        db.order.aggregate({ where: { status: 'PAID' }, _sum: { platformFeeMinor: true } }),
      ])
      const trends = await db.order.groupBy({ by: ['status'], _count: true })
      return jsonOk({
        counts: { users, orgs, events, orders, tickets, broadcasts, payoutsPending: payouts, refundsPending: refundCases, reportsOpen: reports, smsPending, paymentExceptions: exceptions },
        grossVolumeMinor: revenue._sum.totalMinor ?? 0,
        platformRevenueMinor: fees._sum.platformFeeMinor ?? 0,
        orderStatuses: trends,
      })
    }

    if (root === 'users') {
      if (!platformCan(user.role, 'admin:users')) throw errors.forbidden('Support role required.')
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const q = url.searchParams.get('q')
      const where = q ? { OR: [{ email: { contains: q } }, { displayName: { contains: q } }] } : {}
      const items = await db.user.findMany({ where, select: { id: true, email: true, displayName: true, role: true, status: true, city: true, country: true, createdAt: true, phone: true }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
      const total = await db.user.count({ where })
      return jsonList(items, total, page, pageSize)
    }

    if (root === 'orgs') {
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const items = await db.organization.findMany({ include: { verification: true, _count: { select: { events: true, memberships: true } } }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
      const total = await db.organization.count()
      return jsonList(items, total, page, pageSize)
    }

    if (root === 'events') {
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const status = url.searchParams.get('status')
      const where: Record<string, unknown> = { deletedAt: null }
      if (status && status !== 'ALL') where.status = status
      const items = await db.event.findMany({ where, include: { org: { select: { name: true, slug: true } }, _count: { select: { tickets: true } } }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
      const total = await db.event.count({ where })
      return jsonList(items, total, page, pageSize)
    }

    if (root === 'moderation') {
      if (!platformCan(user.role, 'admin:moderate')) throw errors.forbidden('Moderator role required.')
      const items = await db.moderationReport.findMany({ where: { status: { in: ['OPEN', 'REVIEWING'] } }, include: { reporter: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'asc' }, take: 100 })
      return jsonOk({ items })
    }

    if (root === 'fees') {
      const items = await db.feeVersion.findMany({ orderBy: { version: 'desc' } })
      return jsonOk({ items })
    }

    if (root === 'plans') {
      const items = await db.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } })
      return jsonOk({ items })
    }

    if (root === 'payments') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const status = url.searchParams.get('status')
      const where: Record<string, unknown> = {}
      if (status && status !== 'ALL') where.status = status
      const items = await db.paymentAttempt.findMany({ where, include: { order: { select: { reference: true, status: true, buyerEmail: true, eventId: true, exceptionReason: true } } }, orderBy: { initiatedAt: 'desc' }, take: 100 })
      const providerEvents = await db.providerEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 50 })
      return jsonOk({ items, providerEvents })
    }

    if (root === 'refunds') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const items = await db.refundCase.findMany({ include: { order: { select: { reference: true, status: true, totalMinor: true, event: { select: { title: true } } } } }, orderBy: { createdAt: 'asc' }, take: 100 })
      return jsonOk({ items })
    }

    if (root === 'payouts') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const items = await db.payout.findMany({ include: { org: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'asc' }, take: 100 })
      return jsonOk({ items })
    }

    if (root === 'sms') {
      const { smsSimulatorActive, resolveHubtelCreds } = await import('@/server/hubtel/credentials')
      const items = await db.messageDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      return jsonOk({ items, mode: smsSimulatorActive(await resolveHubtelCreds()) ? 'simulated' : 'real' })
    }

    if (root === 'audit') {
      const items = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 150 })
      return jsonOk({ items })
    }

    if (root === 'integrations') {
      return jsonOk({ integrations: await integrationStatuses(), validation: envValidation() })
    }

    if (root === 'hubtel') {
      // Masked credential view + last connection probe (secrets never leave the server).
      const { resolveHubtelCreds, hubtelCredentialsView, readLastProbe } = await import('@/server/hubtel/credentials')
      const creds = await resolveHubtelCreds()
      return jsonOk({ credentials: hubtelCredentialsView(creds), lastProbe: await readLastProbe() })
    }

    if (root === 'outbox') {
      const items = await db.outboxJob.findMany({ orderBy: [{ status: 'asc' }, { runAt: 'asc' }], take: 100 })
      const byStatus = await db.outboxJob.groupBy({ by: ['status'], _count: true })
      return jsonOk({ items, byStatus })
    }

    if (root === 'settings') {
      const items = await db.platformSetting.findMany()
      return jsonOk({ items })
    }

    if (root === 'categories') {
      // R31: taxonomy management — every category carries its true usage count
      // (ALL non-deleted events, not just public ones: admins act on reality).
      const items = await db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
      const counts = await db.event.groupBy({ by: ['categorySlug'], where: { deletedAt: null }, _count: true })
      return jsonOk({ items: items.map((c) => ({ ...c, eventCount: counts.find((x) => x.categorySlug === c.slug)?._count ?? 0 })) })
    }

    if (root === 'ledger') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const accounts = await db.ledgerAccount.findMany({ include: { _count: { select: { entries: true } } } })
      const journals = await db.ledgerJournal.findMany({ orderBy: { createdAt: 'desc' }, take: 40, include: { entries: { include: { account: true } } } })
      return jsonOk({ accounts, journals })
    }

    if (root === 'ops') {
      // R32: uptime history, transition-based alerts and the backup trail —
      // written by the ops monitor loop (scripts/monitor.ts) and the backup
      // script (scripts/backup.ts); the "Run check now" POST reuses the same
      // runner. Uptime percentages are honest: null until a first check exists.
      const targets = ['app', 'worker', 'realtime', 'database'] as const
      const since24h = new Date(Date.now() - 86_400_000)
      const since7d = new Date(Date.now() - 7 * 86_400_000)
      const perTarget = await Promise.all(
        targets.map(async (target) => {
          const [last, up24, total24, up7, total7] = await Promise.all([
            db.opsCheck.findFirst({ where: { target }, orderBy: { checkedAt: 'desc' } }),
            db.opsCheck.count({ where: { target, checkedAt: { gte: since24h }, status: 'UP' } }),
            db.opsCheck.count({ where: { target, checkedAt: { gte: since24h } } }),
            db.opsCheck.count({ where: { target, checkedAt: { gte: since7d }, status: 'UP' } }),
            db.opsCheck.count({ where: { target, checkedAt: { gte: since7d } } }),
          ])
          return {
            target,
            status: last?.status ?? 'UNKNOWN',
            lastCheckedAt: last?.checkedAt ?? null,
            latencyMs: last?.latencyMs ?? null,
            detail: last?.detail ?? null,
            uptime24h: total24 > 0 ? Math.round((up24 / total24) * 100) : null,
            uptime7d: total7 > 0 ? Math.round((up7 / total7) * 100) : null,
          }
        }),
      )
      const [alerts, backups, latestSweep] = await Promise.all([
        db.opsAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
        db.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
        db.opsCheck.findFirst({ orderBy: { checkedAt: 'desc' } }),
      ])
      return jsonOk({
        targets: perTarget,
        alerts,
        backups: backups.map((b) => ({ ...b, bytes: b.bytes.toString() })),
        lastCheckedAt: latestSweep?.checkedAt ?? null,
        commands: {
          monitor: 'bun run ops:monitor (loop) · bun run ops:monitor -- --once',
          backup: 'bun run ops:backup',
        },
      })
    }

    throw errors.notFound('Unknown admin section.')
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { sections } = await ctx.params
    const [root, id, op] = sections
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>)

    // ── Organizer verification (paid selling gate) ─────────────────────────
    if (root === 'orgs' && id && op === 'verify') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required for verification decisions.')
      const decision = body.decision === 'APPROVE' ? 'APPROVED' : body.decision === 'REJECT' ? 'REJECTED' : null
      if (!decision) throw errors.badRequest('decision must be APPROVE or REJECT.')
      const v = await db.organizerVerification.findUnique({ where: { orgId: id } })
      if (!v) throw errors.notFound('Verification case not found.')
      await db.organizerVerification.update({ where: { id: v.id }, data: { status: decision, reviewerId: user.id, decidedAt: new Date(), notes: sanitizeText(body.notes, 500) || v.notes } })
      await db.organization.update({ where: { id }, data: { status: decision === 'APPROVED' ? 'ACTIVE' : 'PENDING_VERIFICATION', verifiedAt: decision === 'APPROVED' ? new Date() : null } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `org.verify.${decision.toLowerCase()}`, entityType: 'Organization', entityId: id })
      const org = await db.organization.findUnique({ where: { id } })
      if (org) {
        const { notifyUser } = await import('@/server/services/notify')
        await notifyUser({ userId: org.ownerId, type: 'VERIFICATION', title: decision === 'APPROVED' ? 'Organization verified' : 'Verification declined', body: decision === 'APPROVED' ? 'You can now sell paid tickets and receive payouts.' : sanitizeText(body.notes, 300) || 'Please review the requirements and resubmit.', link: '#/organizer?tab=settings' }).catch(() => {})
      }
      return jsonOk({ status: decision })
    }

    if (root === 'orgs' && id && op === 'suspend') {
      if (!platformCan(user.role, 'admin:moderate')) throw errors.forbidden('Moderator role required.')
      const org = await db.organization.update({ where: { id }, data: { status: 'SUSPENDED' } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.suspend', entityType: 'Organization', entityId: id })
      void org
      return jsonOk({ suspended: true })
    }

    if (root === 'events' && id && op === 'suspend') {
      if (!platformCan(user.role, 'admin:moderate')) throw errors.forbidden('Moderator role required.')
      await db.event.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: sanitizeText(body.reason, 300) || 'Suspended by platform moderation.' } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'event.suspend', entityType: 'Event', entityId: id })
      return jsonOk({ suspended: true })
    }

    if (root === 'moderation' && id && op === 'action') {
      if (!platformCan(user.role, 'admin:moderate')) throw errors.forbidden('Moderator role required.')
      const action = String(body.action ?? '')
      if (!['DISMISS', 'REVIEWING', 'REMOVE_CONTENT', 'SUSPEND_USER'].includes(action)) throw errors.badRequest('Invalid moderation action.')
      const report = await db.moderationReport.findUnique({ where: { id } })
      if (!report) throw errors.notFound('Report not found.')
      if (action === 'REMOVE_CONTENT') {
        if (report.targetType === 'EVENT') await db.event.updateMany({ where: { id: report.targetId }, data: { status: 'CANCELLED', cancelReason: 'Removed by moderation.' } })
        if (report.targetType === 'COMMENT') await db.comment.updateMany({ where: { id: report.targetId }, data: { status: 'REMOVED' } })
        if (report.targetType === 'BROADCAST') await db.liveBroadcast.updateMany({ where: { id: report.targetId }, data: { status: 'ENDED' } })
      }
      if (action === 'SUSPEND_USER' && report.targetType === 'USER') {
        await db.user.updateMany({ where: { id: report.targetId }, data: { status: 'SUSPENDED' } })
        await db.session.updateMany({ where: { userId: report.targetId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      await db.moderationReport.update({
        where: { id },
        data: { status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', reviewerId: user.id, reviewedAt: new Date(), resolutionNote: sanitizeText(body.note, 500) || action },
      })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `moderation.${action.toLowerCase()}`, entityType: 'ModerationReport', entityId: id })
      return jsonOk({ status: action })
    }

    if (root === 'fees' && !id) {
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required for fee changes.')
      await rateLimit(req, 'fees', 10, 60_000)
      const latest = await db.feeVersion.findFirst({ orderBy: { version: 'desc' } })
      const version = (latest?.version ?? 0) + 1
      const fee = await db.feeVersion.create({
        data: {
          version,
          name: sanitizeText(body.name, 80) || `Fee schedule v${version}`,
          ticketCommissionPct: Math.max(0, Math.min(3000, Math.round(Number(body.ticketCommissionPct ?? 500)))),
          processingFeePct: Math.max(0, Math.min(1000, Math.round(Number(body.processingFeePct ?? 195)))),
          smsRateMinor: Math.max(1, Math.round(Number(body.smsRateMinor ?? 5))),
          createdBy: user.id,
        },
      })
      await db.feeVersion.updateMany({ where: { version: { not: version } }, data: { active: false } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'fees.create', entityType: 'FeeVersion', entityId: fee.id, after: fee })
      return jsonOk({ fee })
    }

    if (root === 'plans' && !id) {
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required for plan changes.')
      const code = sanitizeText(body.code, 12).toUpperCase()
      if (!['BASIC', 'PRO', 'ORG'].includes(code)) throw errors.badRequest('Plan code must be BASIC, PRO or ORG (editable labels).')
      const plan = await db.subscriptionPlan.upsert({
        where: { code },
        create: {
          code,
          name: sanitizeText(body.name, 60) || code,
          description: sanitizeText(body.description, 300) || null,
          priceMinor: Math.max(0, Math.round(Number(body.priceMinor ?? 0))),
          billingPeriodDays: Math.max(7, Math.round(Number(body.billingPeriodDays ?? 30))),
          entitlements: JSON.stringify(body.entitlements ?? {}),
        },
        update: {
          name: sanitizeText(body.name, 60) || undefined,
          description: sanitizeText(body.description, 300) || undefined,
          priceMinor: body.priceMinor !== undefined ? Math.max(0, Math.round(Number(body.priceMinor))) : undefined,
          entitlements: body.entitlements !== undefined ? JSON.stringify(body.entitlements) : undefined,
        },
      })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'plans.update', entityType: 'SubscriptionPlan', entityId: plan.id, after: plan })
      return jsonOk({ plan })
    }

    if (root === 'payouts' && id) {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const { approvePayout, submitPayout, markPayoutPaid, failPayout } = await import('@/server/services/refunds')
      if (op === 'approve') {
        await approvePayout(id, user.id)
        const { audit } = await import('@/server/audit')
        await audit({ actorUserId: user.id, actorLabel: user.email, action: 'payout.approve', entityType: 'Payout', entityId: id })
        return jsonOk({ approved: true })
      }
      if (op === 'submit') {
        const result = await submitPayout(id)
        return jsonOk(result)
      }
      if (op === 'paid') {
        await markPayoutPaid(id)
        const { audit } = await import('@/server/audit')
        await audit({ actorUserId: user.id, actorLabel: user.email, action: 'payout.mark_paid', entityType: 'Payout', entityId: id })
        return jsonOk({ paid: true })
      }
      if (op === 'fail') {
        await failPayout(id, sanitizeText(body.reason, 300) || 'Provider reported failure')
        return jsonOk({ failed: true })
      }
      throw errors.badRequest('Invalid payout operation.')
    }

    if (root === 'refunds' && id) {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const rc = await db.refundCase.findUnique({ where: { id } })
      if (!rc) throw errors.notFound('Refund case not found.')
      if (op === 'approve') {
        await db.refundCase.update({ where: { id }, data: { status: 'APPROVED' } })
        return jsonOk({ approved: true })
      }
      if (op === 'reject') {
        await db.refundCase.update({ where: { id }, data: { status: 'REJECTED', resolutionNote: sanitizeText(body.note, 300) || 'Rejected by finance review.' } })
        const order = await db.order.findUnique({ where: { id: rc.orderId } })
        if (order && order.status === 'REFUND_PENDING') await db.order.update({ where: { id: order.id }, data: { status: 'PAID' } })
        return jsonOk({ rejected: true })
      }
      if (op === 'process') {
        // Privileged financial action — requires recent password re-authentication.
        const { requireElevated } = await import('@/server/api')
        const elevatedUser = await requireElevated()
        const { processRefund } = await import('@/server/services/refunds')
        const result = await processRefund(id, elevatedUser.id)
        const { audit } = await import('@/server/audit')
        await audit({ actorUserId: elevatedUser.id, actorLabel: elevatedUser.email, action: 'refund.process', entityType: 'RefundCase', entityId: id, after: result })
        return jsonOk(result)
      }
      throw errors.badRequest('Invalid refund operation.')
    }

    if (root === 'hubtel' && id === 'credentials') {
      // Round 14: platform admins can connect Hubtel without a redeploy.
      // Hubtel issues ONE API client per business account — the saved pair
      // feeds Checkout, Send Money and SMS. Secrets are write-only here.
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required.')
      await rateLimit(req, 'hubtel-creds', 10, 60_000)
      const { HUBTEL_SETTING_KEYS } = await import('@/server/hubtel/credentials')
      const { setSetting } = await import('@/server/settings')
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
      const clientId = str(body.clientId, 200)
      const clientSecret = str(body.clientSecret, 300)
      const accountId = str(body.accountId, 100)
      const smsSenderId = str(body.smsSenderId, 40)
      const baseUrl = str(body.checkoutBase, 200)
      if (!clientId && !clientSecret && !accountId && !smsSenderId && !baseUrl) throw errors.badRequest('Nothing to save — provide at least one field.')
      const updates: { key: string; value: string }[] = []
      if (clientId) {
        updates.push({ key: HUBTEL_SETTING_KEYS.checkoutClientId, value: clientId })
        updates.push({ key: HUBTEL_SETTING_KEYS.sendMoneyClientId, value: clientId })
        updates.push({ key: HUBTEL_SETTING_KEYS.smsClientId, value: clientId })
      }
      if (clientSecret) {
        updates.push({ key: HUBTEL_SETTING_KEYS.checkoutClientSecret, value: clientSecret })
        updates.push({ key: HUBTEL_SETTING_KEYS.sendMoneyClientSecret, value: clientSecret })
        updates.push({ key: HUBTEL_SETTING_KEYS.smsClientSecret, value: clientSecret })
      }
      if (accountId) updates.push({ key: HUBTEL_SETTING_KEYS.sendMoneyAccountId, value: accountId })
      if (smsSenderId) updates.push({ key: HUBTEL_SETTING_KEYS.smsSenderId, value: smsSenderId })
      if (baseUrl && /^https:\/\//.test(baseUrl)) updates.push({ key: HUBTEL_SETTING_KEYS.checkoutBase, value: baseUrl.replace(/\/$/, '') })
      for (const u of updates) await setSetting(u.key, u.value, user.id)
      const { audit } = await import('@/server/audit')
      await audit({
        actorUserId: user.id,
        actorLabel: user.email,
        action: 'hubtel.credentials.update',
        entityType: 'PlatformSetting',
        entityId: 'hubtel.*',
        after: { keys: updates.map((u) => u.key) },
      })
      return jsonOk({ saved: updates.length, note: 'Credentials stored. The payments simulator switches off automatically if the checkout keys are complete.' })
    }

    if (root === 'hubtel' && id === 'probe') {
      // Round 14: empirical connection test — ONE real GHS 1.00 checkout initiate
      // (unpaid sessions expire at the provider; no live charge is possible).
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required.')
      await rateLimit(req, 'hubtel-probe', 6, 60_000)
      const { resolveHubtelCreds, HUBTEL_SETTING_KEYS, paymentsSimulatorActive } = await import('@/server/hubtel/credentials')
      const { probeCheckoutConnection } = await import('@/server/hubtel/payments')
      const { setSetting } = await import('@/server/settings')
      const creds = await resolveHubtelCreds()
      const probe = await probeCheckoutConnection(env.appUrl, creds)
      await setSetting(HUBTEL_SETTING_KEYS.probeResult, JSON.stringify(probe), user.id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'hubtel.probe', entityType: 'PlatformSetting', entityId: HUBTEL_SETTING_KEYS.probeResult, after: { verdict: probe.verdict, httpStatus: probe.httpStatus } })
      return jsonOk({ probe, paymentsMode: paymentsSimulatorActive(creds) ? 'SIMULATOR' : 'REAL' })
    }

    if (root === 'settings' && !id) {
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required.')
      const key = sanitizeText(body.key, 60)
      const value = sanitizeText(body.value, 200)
      if (!key) throw errors.badRequest('key is required.')
      const { setSetting } = await import('@/server/settings')
      await setSetting(key, value, user.id)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'settings.set', entityType: 'PlatformSetting', entityId: key, after: { value } })
      return jsonOk({ key, value })
    }

    if (root === 'sweeps' && id) {
      if (!platformCan(user.role, 'admin:console')) throw errors.forbidden('Staff role required.')
      const kind = ['reconcile', 'reservations', 'reminders', 'lifecycle', 'sms', 'payouts'].includes(id)
        ? (id as 'reconcile' | 'reservations' | 'reminders' | 'lifecycle' | 'sms' | 'payouts')
        : null
      if (!kind) throw errors.badRequest('Unknown sweep.')
      const result = await sweepOnce(kind)
      return jsonOk({ sweep: kind, result })
    }

    // ── Round 31: taxonomy (categories) management — the last zero-writer ──
    // models get real write paths. Slugs are IMMUTABLE once created (events
    // reference the slug string; a rename would orphan them) and a category
    // in use cannot be deleted — deactivate it instead.
    if (root === 'categories' && !id) {
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required for taxonomy changes.')
      await rateLimit(req, 'taxonomy', 20, 60_000)
      const name = sanitizeText(body.name, 60)
      if (name.length < 3) throw errors.badRequest('Category name is required (at least 3 characters).')
      // Slug: explicit if provided, otherwise derived from the name.
      const rawSlug = typeof body.slug === 'string' && body.slug.trim() ? body.slug : name
      const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
      if (slug.length < 2) throw errors.badRequest('Could not derive a slug from that name — use letters and digits.')
      const existing = await db.category.findUnique({ where: { slug } })
      if (existing) throw errors.conflict(`A category with slug "${slug}" already exists.`)
      const color = sanitizeText(body.color, 7)
      const category = await db.category.create({
        data: {
          name,
          slug,
          icon: sanitizeText(body.icon, 40) || 'calendar',
          color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#10b981',
          sortOrder: Math.max(0, Math.min(999, Math.round(Number(body.sortOrder ?? 0)))),
          active: body.active === undefined ? true : Boolean(body.active),
        },
      })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'category.create', entityType: 'Category', entityId: category.id, after: { slug, name } })
      return jsonOk({ category, note: 'Live immediately — discovery filters, homepage chips and the event editor read the catalog in real time.' })
    }

    if (root === 'categories' && id && (op === 'update' || op === 'delete')) {
      if (!platformCan(user.role, 'admin:settings')) throw errors.forbidden('Super administrator role required for taxonomy changes.')
      await rateLimit(req, 'taxonomy', 20, 60_000)
      const category = await db.category.findUnique({ where: { id } })
      if (!category) throw errors.notFound('Category not found.')
      const { audit } = await import('@/server/audit')

      if (op === 'delete') {
        const inUse = await db.event.count({ where: { categorySlug: category.slug, deletedAt: null } })
        if (inUse > 0) throw errors.conflict(`This category is used by ${inUse} event${inUse === 1 ? '' : 's'} — deactivate it instead (inactive categories vanish from filters and the event editor, while existing events keep their label).`)
        await db.category.delete({ where: { id } })
        await audit({ actorUserId: user.id, actorLabel: user.email, action: 'category.delete', entityType: 'Category', entityId: id, before: { slug: category.slug, name: category.name } })
        return jsonOk({ deleted: true })
      }

      const data: Record<string, unknown> = {}
      if (body.slug !== undefined && String(body.slug) !== category.slug) {
        throw errors.badRequest('The slug is immutable — events reference it directly. Create a new category and deactivate this one instead.')
      }
      if (body.name !== undefined) {
        const name = sanitizeText(body.name, 60)
        if (name.length < 3) throw errors.badRequest('Category name is required (at least 3 characters).')
        data.name = name
      }
      if (body.icon !== undefined) data.icon = sanitizeText(body.icon, 40) || 'calendar'
      if (body.color !== undefined) {
        const color = sanitizeText(body.color, 7)
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw errors.badRequest('Color must be a #RRGGBB hex value.')
        data.color = color
      }
      if (body.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.min(999, Math.round(Number(body.sortOrder) || 0)))
      if (body.active !== undefined) data.active = Boolean(body.active)
      if (Object.keys(data).length === 0) throw errors.badRequest('Nothing to update.')
      const updated = await db.category.update({ where: { id }, data })
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'category.update', entityType: 'Category', entityId: id, before: { active: category.active, name: category.name }, after: { fields: Object.keys(data) } })
      return jsonOk({ category: updated })
    }

    if (root === 'users' && id && op === 'suspend') {
      if (!platformCan(user.role, 'admin:users')) throw errors.forbidden('Support role required.')
      const suspend = body.suspend !== false
      await db.user.update({ where: { id }, data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' } })
      if (suspend) await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: suspend ? 'user.suspend' : 'user.restore', entityType: 'User', entityId: id })
      return jsonOk({ suspended: suspend })
    }

    if (root === 'ops' && id === 'check') {
      // Runs the SAME probe cycle as the standing monitor (src/server/ops/monitor.ts)
      // and persists it — the button is an on-demand datapoint, not a different truth.
      await rateLimit(req, 'ops-check', 6, 60_000)
      const { runOpsChecks, recordOpsChecks } = await import('@/server/ops/monitor')
      const probes = await runOpsChecks(env.appUrl)
      const recorded = await recordOpsChecks(probes)
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'ops.check', entityType: 'OpsCheck', entityId: 'cycle' })
      return jsonOk({ probes, ...recorded })
    }

    throw errors.notFound('Unknown admin operation.')
  })
}
