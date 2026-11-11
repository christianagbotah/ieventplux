import { db } from '../../lib/db'
import { errors } from '../api'
import { getSettings } from '../settings'

/**
 * Subscription plans and entitlement enforcement.
 * Backend-enforced limits; expiry restricts NEW organizer activity but never
 * invalidates purchased attendee tickets or destroys financial records.
 */

export interface PlanEntitlements {
  maxPublishedEvents: number
  teamSeats: number
  analytics: boolean
  smsPerMonth: number
  streamMinutesPerMonth: number
  replaysIncluded: boolean
}

const DEFAULT_ENTITLEMENTS: Record<string, PlanEntitlements> = {
  BASIC: { maxPublishedEvents: 3, teamSeats: 2, analytics: false, smsPerMonth: 100, streamMinutesPerMonth: 60, replaysIncluded: false },
  PRO: { maxPublishedEvents: 25, teamSeats: 8, analytics: true, smsPerMonth: 1000, streamMinutesPerMonth: 600, replaysIncluded: true },
  ORG: { maxPublishedEvents: 200, teamSeats: 30, analytics: true, smsPerMonth: 5000, streamMinutesPerMonth: 3000, replaysIncluded: true },
}

export function entitlementsOf(planCode: string, raw?: string): PlanEntitlements {
  if (raw) {
    try {
      return { ...DEFAULT_ENTITLEMENTS[planCode] ?? DEFAULT_ENTITLEMENTS.BASIC, ...JSON.parse(raw) }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_ENTITLEMENTS[planCode] ?? DEFAULT_ENTITLEMENTS.BASIC
}

export async function orgSubscription(orgId: string) {
  const sub = await db.subscription.findUnique({ where: { orgId }, include: { plan: true } })
  if (!sub) return { status: 'NONE' as const, planCode: null, entitlements: DEFAULT_ENTITLEMENTS.BASIC, currentPeriodEnd: null }
  const settings = await getSettings()
  let status = sub.status
  const now = new Date()
  if (status === 'ACTIVE' && sub.currentPeriodEnd < now) {
    const graceEnd = new Date(sub.currentPeriodEnd.getTime() + settings.gracePeriodDays * 86400_000)
    status = now < graceEnd ? 'GRACE' : 'EXPIRED'
  }
  return {
    status,
    planCode: sub.plan.code,
    entitlements: entitlementsOf(sub.plan.code, sub.plan.entitlements),
    currentPeriodEnd: sub.currentPeriodEnd,
  }
}

export async function assertCanPublishNewEvent(orgId: string) {
  const sub = await orgSubscription(orgId)
  if (sub.status === 'NONE') return // unverified/dev orgs may publish within baseline limits
  if (sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
    throw errors.forbidden('Your subscription has expired. Renew to publish new events. Existing attendee tickets remain valid.')
  }
  if (sub.status === 'GRACE') return // allowed during grace, clearly labelled in the workspace
  const published = await db.event.count({ where: { orgId, status: { in: ['PUBLISHED', 'LIVE', 'SCHEDULED'] }, deletedAt: null } })
  if (published >= sub.entitlements.maxPublishedEvents) {
    throw errors.forbidden(`Plan limit reached (${sub.entitlements.maxPublishedEvents} published events). Upgrade your plan to publish more.`)
  }
}

export async function activateSubscription(orgId: string, planId: string, days?: number) {
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
  if (!plan) throw errors.notFound('Plan not found.')
  const periodDays = days ?? plan.billingPeriodDays
  const existing = await db.subscription.findUnique({ where: { orgId } })
  const currentPeriodEnd = new Date(Date.now() + periodDays * 86400_000)
  if (existing) {
    await db.subscription.update({
      where: { orgId },
      data: { planId, status: 'ACTIVE', currentPeriodEnd, cancelledAt: null },
    })
  } else {
    await db.subscription.create({ data: { orgId, planId, status: 'ACTIVE', currentPeriodEnd } })
  }
  await db.invoice.create({
    data: {
      orgId,
      number: `INV-${Date.now()}-${orgId.slice(-4).toUpperCase()}`,
      subscriptionId: existing?.id ?? (await db.subscription.findUnique({ where: { orgId } }))?.id,
      description: `${plan.name} subscription (${periodDays} days)`,
      amountMinor: plan.priceMinor,
      status: 'PAID',
      paidAt: new Date(),
    },
  })
  return { currentPeriodEnd }
}
