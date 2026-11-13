import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, jsonList, pagination, sanitizeText, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan, ORG_ROLES } from '@/server/permissions'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * Organization-scoped endpoints. The org id in the URL is a SCOPE, never an
 * authorization source — membership is always resolved from the session first.
 *
 *  GET  team | finance | payouts | invoices | messages | verification | events
 *  POST team | payouts | payout-request (etc. via action)
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')

    if (action === 'team') {
      if (!orgCan(membership.role, 'org:manage_team') && !orgCan(membership.role, 'orders:view')) throw errors.forbidden('Team management requires an admin role.')
      const members = await db.membership.findMany({ where: { orgId: id }, include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true, phone: true } } } })
      return jsonOk({ items: members.map((m) => ({ id: m.id, role: m.role, user: m.user, acceptedAt: m.acceptedAt })) })
    }

    if (action === 'finance') {
      if (!orgCan(membership.role, 'org:view_finance')) throw errors.forbidden('Finance visibility requires a finance role.')
      const { orgFinanceSummary } = await import('@/server/ledger')
      const summary = await orgFinanceSummary(id)
      const journals = await db.ledgerJournal.findMany({ where: { orgId: id }, orderBy: { createdAt: 'desc' }, take: 25, include: { entries: { include: { account: true } } } })
      const invoices = await db.invoice.findMany({ where: { orgId: id }, orderBy: { issuedAt: 'desc' }, take: 25 })
      const refundCases = await db.refundCase.findMany({
        where: { order: { orgId: id } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          order: { select: { reference: true, status: true, event: { select: { title: true } } } },
          requester: { select: { id: true, displayName: true, email: true } },
        },
      })
      // Buyer-requested vs org-opened: a requester who holds a membership in THIS
      // org opened the case on the buyer's behalf (or as goodwill) — computed once,
      // in the same round trip, instead of guessing on the client.
      const requesterIds = refundCases.map((rc) => rc.requester.id).filter((rid, i, arr) => arr.indexOf(rid) === i)
      const staffRequesters = requesterIds.length
        ? await db.membership.findMany({ where: { orgId: id, userId: { in: requesterIds } }, select: { userId: true } })
        : []
      const staffIds = new Set(staffRequesters.map((m) => m.userId))
      return jsonOk({ summary, journals, invoices, refundCases: refundCases.map((rc) => ({ ...rc, requesterIsStaff: staffIds.has(rc.requester.id) })) })
    }

    if (action === 'payouts') {
      if (!orgCan(membership.role, 'org:view_finance')) throw errors.forbidden('Payouts visibility requires a finance role.')
      const payouts = await db.payout.findMany({ where: { orgId: id }, orderBy: { createdAt: 'desc' }, take: 30 })
      return jsonOk({ items: payouts.map((p) => ({ ...p, destination: p.status === 'PAID' ? '(redacted)' : p.destination })) })
    }

    if (action === 'messages') {
      if (!orgCan(membership.role, 'orders:view')) throw errors.forbidden()
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const deliveries = await db.messageDelivery.findMany({ where: { orgId: id }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
      const total = await db.messageDelivery.count({ where: { orgId: id } })
      return jsonList(deliveries, total, page, pageSize)
    }

    if (action === 'verification') {
      const v = await db.organizerVerification.findUnique({ where: { orgId: id } })
      return jsonOk({ verification: v, orgStatus: membership.orgStatus })
    }

    if (action === 'events') {
      const { page, pageSize, offset } = pagination(req, 20, 60)
      const where = { orgId: id, deletedAt: null }
      const events = await db.event.findMany({ where, orderBy: { startsAt: 'desc' }, skip: offset, take: pageSize })
      const total = await db.event.count({ where })
      return jsonList(events, total, page, pageSize)
    }

    if (action === 'subscription') {
      const { orgSubscription } = await import('@/server/services/subscriptions')
      return jsonOk(await orgSubscription(id))
    }

    if (action === 'overview') {
      const now = new Date()
      const [published, draft, live, ticketsSold, revenue, followers, upcoming, ticketTypeCount, orgRow, verificationRow] = await Promise.all([
        db.event.count({ where: { orgId: id, status: { in: ['PUBLISHED', 'SCHEDULED'] }, deletedAt: null } }),
        db.event.count({ where: { orgId: id, status: 'DRAFT', deletedAt: null } }),
        db.event.count({ where: { orgId: id, status: 'LIVE', deletedAt: null } }),
        db.ticket.count({ where: { event: { orgId: id } } }),
        db.order.aggregate({ where: { orgId: id, status: 'PAID' }, _sum: { totalMinor: true } }),
        db.follow.count({ where: { orgId: id } }),
        db.event.findMany({ where: { orgId: id, startsAt: { gte: now }, deletedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED'] } }, orderBy: { startsAt: 'asc' }, take: 5 }),
        db.ticketType.count({ where: { event: { orgId: id }, active: true } }),
        db.organization.findUnique({ where: { id }, select: { status: true } }),
        db.organizerVerification.findUnique({ where: { orgId: id }, select: { status: true, evidence: true } }),
      ])
      // R23 onboarding: the dashboard checklist is computed from this ONE round
      // trip — evidenceCount (>0 = documents submitted at least once; the row is
      // created with an empty array at org creation) distinguishes "awaiting
      // review" from "never submitted" even though both are status PENDING.
      let evidenceCount = 0
      try {
        const arr = JSON.parse(verificationRow?.evidence ?? '[]')
        if (Array.isArray(arr)) evidenceCount = arr.length
      } catch { evidenceCount = 0 }
      const { orgFinanceSummary } = await import('@/server/ledger')
      return jsonOk({
        counts: { published, draft, live, ticketsSold, followers },
        grossMinor: revenue._sum.totalMinor ?? 0,
        finance: await orgFinanceSummary(id),
        upcoming,
        onboarding: {
          orgStatus: orgRow?.status ?? 'PENDING_VERIFICATION',
          verificationStatus: verificationRow?.status ?? 'PENDING',
          evidenceCount,
          ticketTypeCount,
        },
      })
    }

    if (action === 'insights') {
      // Analytics derived only from real transactional rows — see the service
      // header for the honesty contract (no invented page-view metrics).
      const { orgInsights } = await import('@/server/services/insights')
      return jsonOk(await orgInsights(id))
    }

    throw errors.notFound('Unknown organization endpoint.')
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership) throw errors.forbidden('You are not a member of this organization.')
    const body = await readJson<Record<string, unknown>>(req)

    if (action === 'team') {
      if (!orgCan(membership.role, 'org:manage_team')) throw errors.forbidden('Team management requires an admin role.')
      const sub = action
      void sub
      const email = String(body.email ?? '').toLowerCase().trim()
      const role = ORG_ROLES.includes(String(body.role) as never) ? String(body.role) : null
      if (!role) throw errors.badRequest('Invalid role.')
      const target = await db.user.findUnique({ where: { email } })
      if (!target) throw errors.notFound('No iEventPlux account with that email. Ask them to sign up first.')
      if (role === 'OWNER') throw errors.forbidden('Ownership transfer requires platform support.')
      const existing = await db.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: target.id } } })
      if (existing) {
        await db.membership.update({ where: { id: existing.id }, data: { role } })
        return jsonOk({ updated: true })
      }
      await db.membership.create({ data: { orgId: id, userId: target.id, role, invitedAt: new Date() } })
      const { notifyUser } = await import('@/server/services/notify')
      await notifyUser({ userId: target.id, type: 'TEAM', title: `You've been added to ${membership.orgName}`, body: `Role: ${role}. Open your organizer workspace to get started.`, link: '#/organizer' }).catch(() => {})
      return jsonOk({ added: true })
    }

    if (action === 'payout-request') {
      if (!orgCan(membership.role, 'org:manage_payouts')) throw errors.forbidden('Payouts require a finance role.')
      const { requestPayout } = await import('@/server/services/refunds')
      const payout = await requestPayout({
        orgId: id,
        requestedBy: user.id,
        amountMinor: Math.round(Number(body.amountMinor ?? 0)),
        destination: { momoNumber: String(body.momoNumber ?? ''), recipientName: String(body.recipientName ?? membership.orgName) },
      })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'payout.request', entityType: 'Payout', entityId: payout.id, after: { amountMinor: payout.amountMinor } })
      return jsonOk({ payout })
    }

    if (action === 'refund-request') {
      if (!orgCan(membership.role, 'refund:request')) throw errors.forbidden('Refund requests require a finance role.')
      const { requestRefund } = await import('@/server/services/refunds')
      const rc = await requestRefund({ orderId: String(body.orderId ?? ''), requestedBy: user.id, reason: String(body.reason ?? '') })
      return jsonOk({ refundCase: rc })
    }

    if (action === 'refund-approve' || action === 'refund-reject') {
      if (!orgCan(membership.role, 'refund:request')) throw errors.forbidden('Refund decisions require a finance role.')
      const caseId = String(body.caseId ?? '')
      // Scope check: the case must belong to THIS org's order — the URL id is a
      // scope, never an authorization to act on another org's money.
      const rc = await db.refundCase.findUnique({ where: { id: caseId }, select: { id: true, orderId: true, order: { select: { orgId: true, reference: true } } } })
      if (!rc || rc.order.orgId !== id) throw errors.notFound('Refund case not found for this organization.')
      const { audit } = await import('@/server/audit')
      if (action === 'refund-approve') {
        const { approveRefund } = await import('@/server/services/refunds')
        const result = await approveRefund(caseId, user.id)
        await audit({ actorUserId: user.id, actorLabel: user.email, action: 'refund.approve', entityType: 'RefundCase', entityId: caseId, after: result })
        return jsonOk({ ...result, note: 'Approved — the platform finance desk executes the money reversal.' })
      }
      const note = sanitizeText(body.note, 300)
      const { rejectRefund } = await import('@/server/services/refunds')
      const result = await rejectRefund(caseId, user.id, note)
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'refund.reject', entityType: 'RefundCase', entityId: caseId, after: { rejected: true, note } })
      return jsonOk(result)
    }

    if (action === 'verification-submit') {
      const evidence = sanitizeText(body.evidence, 1000)
      const v = await db.organizerVerification.upsert({
        where: { orgId: id },
        create: { orgId: id, status: 'PENDING', evidence: JSON.stringify([{ type: 'notes', ref: evidence }]) },
        update: { status: 'PENDING', evidence: JSON.stringify([{ type: 'notes', ref: evidence }]), submittedAt: new Date() },
      })
      return jsonOk({ verification: v, note: 'Documents received. Platform finance review follows.' })
    }

    if (action === 'settings') {
      if (!orgCan(membership.role, 'org:manage')) throw errors.forbidden('Organization settings require an admin role.')
      const data: Record<string, unknown> = {}
      if (body.tagline !== undefined) data.tagline = sanitizeText(body.tagline, 160) || null
      if (body.description !== undefined) data.description = sanitizeText(body.description, 2000) || null
      if (body.city !== undefined) data.city = sanitizeText(body.city, 60) || null
      if (body.contactEmail !== undefined) data.contactEmail = sanitizeText(body.contactEmail, 160) || null
      if (body.contactPhone !== undefined) data.contactPhone = sanitizeText(body.contactPhone, 24) || null
      if (body.website !== undefined) data.website = sanitizeText(body.website, 200) || null
      if (body.coverUrl !== undefined && String(body.coverUrl).startsWith('/')) data.coverUrl = String(body.coverUrl)
      // Payout destination changes are audited (restriction documented in PAYMENTS_AND_SETTLEMENTS.md).
      if (body.payoutMomoNumber !== undefined) {
        const prev = await db.organization.findUnique({ where: { id } })
        data.payoutProfile = JSON.stringify({ momoNumber: String(body.payoutMomoNumber).slice(0, 24), recipientName: String(body.payoutRecipientName ?? prev?.name ?? '').slice(0, 120) })
        const { audit } = await import('@/server/audit')
        await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.payout_destination_change', entityType: 'Organization', entityId: id, before: { payoutProfile: prev?.payoutProfile }, after: { payoutProfile: data.payoutProfile } })
      }
      const org = await db.organization.update({ where: { id }, data })
      return jsonOk({ org: { ...org, payoutProfile: '(redacted)' } })
    }

    if (action === 'subscription-cancel') {
      const sub = await db.subscription.findUnique({ where: { orgId: id } })
      if (!sub) throw errors.notFound('No active subscription.')
      await db.subscription.update({ where: { orgId: id }, data: { status: 'CANCELLED', cancelledAt: new Date(), autoRenew: false } })
      return jsonOk({ cancelled: true, note: 'Plan cancelled. Existing attendee tickets remain valid.' })
    }

    if (action === 'ai-advisor') {
      // Round 14: org-scoped AI advisor (pricing suggestions / weekly digest).
      // Read-only advisory — nothing is auto-applied to real prices.
      if (!orgCan(membership.role, 'org:view_finance')) throw errors.forbidden('The AI advisor requires a finance role.')
      rateLimit(req, 'ai-advisor', 8, 60_000)
      const { orgPricingAdvisor, orgDigestAdvisor } = await import('@/server/services/aiAdvisor')
      const kind = String(body.kind ?? 'pricing')
      if (kind === 'digest') return jsonOk(await orgDigestAdvisor(id))
      if (kind === 'pricing') return jsonOk(await orgPricingAdvisor(id))
      throw errors.badRequest('kind must be pricing or digest.')
    }

    throw errors.notFound('Unknown organization action.')
  })
}
