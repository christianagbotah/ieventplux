import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'
import { createCampaign, campaignMetrics } from '@/server/services/promotions'

/** GET /api/v1/promotions?orgId= — list org campaigns. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId') ?? ''
    const membership = await membershipFor(user.id, orgId)
    if (!membership || !orgCan(membership.role, 'promotions:manage')) throw errors.forbidden('Promotions require an organizer role.')
    const { page, pageSize, offset } = pagination(req, 20, 60)
    const campaigns = await db.promotionCampaign.findMany({
      where: { orgId },
      include: { event: { select: { id: true, title: true, slug: true, coverImageUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: pageSize,
    })
    const total = await db.promotionCampaign.count({ where: { orgId } })
    const items = await Promise.all(
      campaigns.map(async (c) => ({ ...c, metrics: await campaignMetrics(c.id) }))
    )
    return jsonList(items, total, page, pageSize)
  })
}

/** POST /api/v1/promotions — create a boost campaign. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)
    const orgId = String(body.orgId ?? '')
    const membership = await membershipFor(user.id, orgId)
    if (!membership || !orgCan(membership.role, 'promotions:manage')) throw errors.forbidden('Promotions require an organizer role.')
    const campaign = await createCampaign({
      orgId,
      eventId: String(body.eventId ?? ''),
      name: String(body.name ?? 'Boost'),
      budgetMinor: Math.round(Number(body.budgetMinor ?? 0)),
      cpmMinor: Math.max(100, Math.round(Number(body.cpmMinor ?? 500))),
      startsAt: new Date(String(body.startsAt ?? new Date().toISOString())),
      endsAt: new Date(String(body.endsAt ?? new Date(Date.now() + 7 * 86400000).toISOString())),
      targeting: {
        cities: Array.isArray((body.targeting as Record<string, unknown>)?.cities) ? ((body.targeting as { cities: string[] }).cities as string[]) : [],
        categories: Array.isArray((body.targeting as Record<string, unknown>)?.categories) ? ((body.targeting as { categories: string[] }).categories as string[]) : [],
        interests: Array.isArray((body.targeting as Record<string, unknown>)?.interests) ? ((body.targeting as { interests: string[] }).interests as string[]) : [],
      },
      createdBy: user.id,
    })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'promotion.create', entityType: 'PromotionCampaign', entityId: campaign.id, after: { budgetMinor: campaign.budgetMinor } })
    return jsonOk({ campaign })
  })
}
