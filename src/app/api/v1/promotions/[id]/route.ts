import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'
import { campaignMetrics } from '@/server/services/promotions'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/v1/promotions/[id] — campaign detail + metrics. */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const user = await requireUser()
    const campaign = await db.promotionCampaign.findUnique({ where: { id }, include: { event: { select: { title: true, slug: true } } } })
    if (!campaign) throw errors.notFound('Campaign not found.')
    const membership = await membershipFor(user.id, campaign.orgId)
    if (!membership || !orgCan(membership.role, 'promotions:manage')) throw errors.forbidden('Promotions require an organizer role.')
    return jsonOk({ campaign: { ...campaign, metrics: await campaignMetrics(id) } })
  })
}

/** PATCH /api/v1/promotions/[id] — pause/resume/staff adjustments. */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ status?: string; budgetMinor?: number }>(req)
    const campaign = await db.promotionCampaign.findUnique({ where: { id } })
    if (!campaign) throw errors.notFound('Campaign not found.')
    const membership = await membershipFor(user.id, campaign.orgId)
    if (!membership || !orgCan(membership.role, 'promotions:manage')) throw errors.forbidden('Promotions require an organizer role.')
    const data: Record<string, unknown> = {}
    if (body.status && ['PAUSED', 'RUNNING', 'SCHEDULED', 'COMPLETED'].includes(String(body.status))) data.status = String(body.status)
    if (body.budgetMinor !== undefined) {
      const budget = Math.round(Number(body.budgetMinor))
      if (budget < campaign.spentMinor) throw errors.conflict('Budget cannot be lower than already-spent amount.')
      data.budgetMinor = budget
    }
    const updated = await db.promotionCampaign.update({ where: { id }, data })
    return jsonOk({ campaign: updated })
  })
}

/** POST /api/v1/promotions/[id] — telemetry ingestion (impressions/clicks/conversions, deduplicated). */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ kind?: string }>(req)
    const kind = ['IMPRESSION', 'CLICK', 'CONVERSION'].includes(String(body.kind)) ? (String(body.kind) as 'IMPRESSION' | 'CLICK' | 'CONVERSION') : null
    if (!kind) throw errors.badRequest('Invalid telemetry kind.')
    const { recordTelemetry } = await import('@/server/services/promotions')
    const result = await recordTelemetry({
      campaignId: id,
      kind,
      userId: user.id,
      dedupKey: `api:${id}:${kind}:${user.id}:${new Date().toISOString().slice(0, 13)}`,
    })
    return jsonOk(result)
  })
}
