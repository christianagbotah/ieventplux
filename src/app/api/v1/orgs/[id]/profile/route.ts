import { NextRequest } from 'next/server'
import { handle, jsonOk, errors } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

/** GET /api/v1/orgs/[slug]/profile — public organizer profile + public events only. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const org = await db.organization.findUnique({ where: { slug: id } })
    if (!org || org.deletedAt) throw errors.notFound('Organizer not found.')
    const session = await getSession()
    const following = session ? Boolean(await db.follow.findFirst({ where: { followerId: session.user.id, orgId: org.id } })) : false
    // Only PUBLIC events appear on public organizer profiles (unlisted/invited never leak).
    const events = await db.event.findMany({
      where: { orgId: org.id, visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'] } },
      orderBy: { startsAt: 'desc' },
      take: 24,
      select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, city: true, mode: true, status: true, categorySlug: true, ticketTypes: { select: { priceMinor: true }, where: { active: true } } },
    })
    const followers = await db.follow.count({ where: { orgId: org.id } })
    const clips = await db.mediaAsset.findMany({ where: { orgId: org.id, kind: 'CLIP' }, orderBy: { createdAt: 'desc' }, take: 8 })
    return jsonOk({
      org: {
        id: org.id, name: org.name, slug: org.slug, tagline: org.tagline, description: org.description,
        logoUrl: org.logoUrl, coverUrl: org.coverUrl, orgType: org.orgType, city: org.city, country: org.country,
        website: org.website, contactEmail: org.contactEmail, verifiedAt: org.verifiedAt, verified: Boolean(org.verifiedAt),
      },
      events, followers, following, clips,
    })
  })
}
