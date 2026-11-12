import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { setReviewStatus } from '@/server/services/reviews'
import { audit } from '@/server/audit'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * POST /api/v1/reviews/[id]/hide|unhide — organizer moderation of reviews.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()

    if (action !== 'hide' && action !== 'unhide') throw errors.notFound('Unknown review action.')
    const review = await db.eventReview.findUnique({ where: { id }, select: { eventId: true } })
    if (!review) throw errors.notFound('Review not found.')
    const access = await eventOrgAccess(user.id, review.eventId, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Only the event organizers can moderate reviews.')

    const result = await setReviewStatus({ reviewId: id, to: action === 'hide' ? 'HIDDEN' : 'VISIBLE' })
    await audit({ actorUserId: user.id, actorLabel: user.email, action: `review.${action}`, entityType: 'EventReview', entityId: id })
    return jsonOk({ ...result, note: action === 'hide' ? 'Review hidden from the public page.' : 'Review restored.' })
  })
}
