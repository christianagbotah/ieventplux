import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { platformCan } from '@/server/permissions'
import { integrationStatuses, envValidation, env } from '@/server/env'
import { sweepOnce } from '@/server/jobs/handlers'

/**
 * Platform administration API (staff-only, narrowly scoped, audited):
 *
 * GET  overview | users | orgs | events | moderation | fees | plans | payments | refunds | payouts | sms | audit | integrations | outbox | settings | categories
 * POST orgs/:id/verify | events/:id/suspend | moderation/:id/action | fees | plans | payouts/:id/submit|paid|fail | refunds/:id/process|approve|reject | settings | sweeps/:kind
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
      const items = await db.messageDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      return jsonOk({ items, mode: env.smsSimulator ? 'simulated' : 'real' })
    }

    if (root === 'audit') {
      const items = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 150 })
      return jsonOk({ items })
    }

    if (root === 'integrations') {
      return jsonOk({ integrations: integrationStatuses(), validation: envValidation() })
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
      const items = await db.category.findMany({ orderBy: { sortOrder: 'asc' } })
      return jsonOk({ items })
    }

    if (root === 'ledger') {
      if (!platformCan(user.role, 'admin:finance')) throw errors.forbidden('Finance administrator role required.')
      const accounts = await db.ledgerAccount.findMany({ include: { _count: { select: { entries: true } } } })
      const journals = await db.ledgerJournal.findMany({ orderBy: { createdAt: 'desc' }, take: 40, include: { entries: { include: { account: true } } } })
      return jsonOk({ accounts, journals })
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
      rateLimit(req, 'fees', 10, 60_000)
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
      const kind = ['reconcile', 'reservations', 'reminders', 'lifecycle', 'sms'].includes(id) ? (id as 'reconcile' | 'reservations' | 'reminders' | 'lifecycle' | 'sms') : null
      if (!kind) throw errors.badRequest('Unknown sweep.')
      const result = await sweepOnce(kind)
      return jsonOk({ sweep: kind, result })
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

    throw errors.notFound('Unknown admin operation.')
  })
}
