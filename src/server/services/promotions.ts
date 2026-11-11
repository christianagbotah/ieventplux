import { db } from '../../lib/db'
import { errors } from '../api'
import { postJournal, ensureOrgAccounts, ensurePlatformAccounts } from '../ledger'

/**
 * Promotion campaigns with atomic budget enforcement.
 * Billing model: fixed CPM (configurable). Impression/click/conversion telemetry
 * carries unique dedup keys — duplicated events cannot charge twice, and the
 * budget decrement happens in the same transaction as the billing row insert.
 */

export interface TelemetryInput {
  campaignId: string
  kind: 'IMPRESSION' | 'CLICK' | 'CONVERSION'
  userId?: string | null
  dedupKey: string
}

export async function recordTelemetry(input: TelemetryInput): Promise<{ billed: boolean; reason?: string }> {
  const campaign = await db.promotionCampaign.findUnique({ where: { id: input.campaignId } })
  if (!campaign) return { billed: false, reason: 'not_found' }
  if (!['RUNNING'].includes(campaign.status)) return { billed: false, reason: 'not_running' }
  const now = new Date()
  if (campaign.startsAt > now || campaign.endsAt < now) return { billed: false, reason: 'outside_schedule' }

  // Frequency cap: impressions per user per day.
  if (input.userId) {
    const since = new Date(now.getTime() - 24 * 3600 * 1000)
    const count = await db.promotionDelivery.count({
      where: { campaignId: campaign.id, kind: 'IMPRESSION', userId: input.userId, occurredAt: { gte: since } },
    })
    if (count >= campaign.frequencyCapPerDay) return { billed: false, reason: 'frequency_cap' }
  }

  // Only IMPRESSION events bill (CPM model). Clicks/conversions are attribution data.
  const billable = input.kind === 'IMPRESSION' ? Math.ceil(campaign.cpmMinor / 1000) : 0

  const result = await db.$transaction(async (tx) => {
    const dupe = await tx.promotionDelivery.findUnique({ where: { dedupKey: input.dedupKey } })
    if (dupe) return { billed: false, reason: 'duplicate' }
    const fresh = await tx.promotionCampaign.findUnique({ where: { id: campaign.id } })
    if (!fresh) return { billed: false, reason: 'not_found' }
    if (billable > 0 && fresh.spentMinor + billable > fresh.budgetMinor) {
      await tx.promotionCampaign.update({ where: { id: fresh.id }, data: { status: 'EXHAUSTED' } })
      return { billed: false, reason: 'budget_exhausted' }
    }
    await tx.promotionDelivery.create({
      data: { campaignId: campaign.id, kind: input.kind, userId: input.userId ?? null, dedupKey: input.dedupKey, billableMinor: billable, billed: billable > 0 },
    })
    if (billable > 0) {
      await tx.promotionCampaign.update({ where: { id: campaign.id }, data: { spentMinor: { increment: billable } } })
    }
    return { billed: billable > 0 }
  })

  // When budget becomes exhausted → also flip status if spend reached budget.
  if (result.billed) {
    const fresh = await db.promotionCampaign.findUnique({ where: { id: campaign.id } })
    if (fresh && fresh.spentMinor >= fresh.budgetMinor && fresh.status === 'RUNNING') {
      await db.promotionCampaign.update({ where: { id: campaign.id }, data: { status: 'COMPLETED' } })
    }
  }
  return result
}

/** Bill accumulated promotion spend against the organizer's payable (worker sweep). */
export async function billPromotionSpend(campaignId: string) {
  const campaign = await db.promotionCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) return
  const unbilled = await db.promotionDelivery.aggregate({
    where: { campaignId, billed: true, occurredAt: { lt: new Date(Date.now() - 60_000) } },
    _sum: { billableMinor: true },
  })
  const amount = unbilled._sum.billableMinor ?? 0
  if (amount <= 0) return
  await ensureOrgAccounts(campaign.orgId)
  await ensurePlatformAccounts()
  const posted = await postJournal({
    idempotencyKey: `promotion-bill:${campaignId}:${Date.now()}`,
    orgId: campaign.orgId,
    refType: 'PROMOTION',
    refId: campaignId,
    memo: `Promotion spend campaign ${campaign.name}`,
    createdBy: 'system:promotion',
    lines: [
      { accountCode: 'organizer_payable', orgScoped: true, direction: 'DEBIT', amountMinor: amount },
      { accountCode: 'promotions_revenue', orgScoped: false, direction: 'CREDIT', amountMinor: amount },
    ],
  })
  if (posted && !posted.replay) {
    // Mark billed entries as settled by zeroing future aggregation via billed=false bookkeeping:
    await db.promotionDelivery.updateMany({ where: { campaignId, billed: true }, data: { billed: false, billableMinor: 0 } })
  }
}

export async function campaignMetrics(campaignId: string) {
  const [impressions, clicks, conversions, uniques] = await Promise.all([
    db.promotionDelivery.count({ where: { campaignId, kind: 'IMPRESSION' } }),
    db.promotionDelivery.count({ where: { campaignId, kind: 'CLICK' } }),
    db.promotionDelivery.count({ where: { campaignId, kind: 'CONVERSION' } }),
    db.promotionDelivery.groupBy({ by: ['userId'], where: { campaignId, kind: 'IMPRESSION', userId: { not: null } } }),
  ])
  return { impressions, clicks, conversions, uniqueUsers: uniques.length, ctr: impressions ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0.00%' }
}

export async function createCampaign(params: {
  orgId: string
  eventId: string
  name: string
  budgetMinor: number
  cpmMinor: number
  startsAt: Date
  endsAt: Date
  targeting: { cities?: string[]; categories?: string[]; interests?: string[] }
  createdBy: string
}) {
  if (params.budgetMinor < 500) throw errors.badRequest('Minimum boost budget is ₵5.00.')
  if (params.endsAt <= params.startsAt) throw errors.badRequest('End date must be after start date.')
  const event = await db.event.findUnique({ where: { id: params.eventId } })
  if (!event || event.orgId !== params.orgId) throw errors.notFound('Event not found for this organization.')
  const campaign = await db.promotionCampaign.create({
    data: {
      orgId: params.orgId,
      eventId: params.eventId,
      name: params.name.slice(0, 120),
      budgetMinor: params.budgetMinor,
      cpmMinor: params.cpmMinor,
      status: 'SCHEDULED',
      targeting: JSON.stringify(params.targeting),
      startsAt: params.startsAt,
      endsAt: params.endsAt,
    },
  })
  return campaign
}
