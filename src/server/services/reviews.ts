import { db } from '../../lib/db'
import { errors } from '../api'

/**
 * Post-event reviews with honest gating.
 *
 * Rules:
 *  - Reviews open only for ENDED events (a live/upcoming event has no honest
 *    "how was it" yet) and only for fulfilled ticket holders.
 *  - One review per attendee (unique index); posting again EDITS the review —
 *    ratings are opinions and may change, so edit semantics are the honest UX.
 *  - HIDDEN reviews are organizer-only surfaces; aggregates count VISIBLE only.
 */

export interface ReviewItem {
  id: string
  rating: number
  body: string | null
  status: string
  createdAt: string
  updatedAt: string
  author: { id: string; displayName: string }
  isMine: boolean
}

export interface ReviewAggregate {
  average: number // e.g. 4.7, 0 when no reviews
  count: number
  distribution: { rating: number; count: number }[] // 5 → 1
}

async function ticketHolder(userId: string, eventId: string): Promise<boolean> {
  // A fulfilled order (paid via checkout, or a fulfilled free RSVP) for this user on this event.
  const ticket = await db.ticket.findFirst({
    where: { userId, eventId, order: { status: 'PAID' } },
    select: { id: true },
  })
  return Boolean(ticket)
}

export async function reviewEligibility(userId: string, eventId: string): Promise<{ eligible: boolean; reason: 'ENDED' | 'NOT_TICKET_HOLDER' | 'ELIGIBLE' }> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { status: true, deletedAt: true, endsAt: true } })
  if (!event || event.deletedAt) throw errors.notFound('Event not found.')
  if (event.status !== 'ENDED') return { eligible: false, reason: 'ENDED' }
  const has = await ticketHolder(userId, eventId)
  return has ? { eligible: true, reason: 'ELIGIBLE' } : { eligible: false, reason: 'NOT_TICKET_HOLDER' }
}

export async function listReviews(eventId: string, viewerUserId: string | null, isOrg: boolean) {
  // Fetch every row (authors must still see their own HIDDEN review); visibility
  // is applied below so aggregates always count VISIBLE reviews only.
  const rows = await db.eventReview.findMany({
    where: { eventId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const visible = rows.filter((r) => r.status === 'VISIBLE')
  const count = visible.length
  const sum = visible.reduce((acc, r) => acc + r.rating, 0)
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: visible.filter((r) => r.rating === rating).length }))

  const aggregate: ReviewAggregate = {
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    count,
    distribution,
  }

  const mine = viewerUserId ? rows.find((r) => r.userId === viewerUserId) ?? null : null

  return {
    aggregate,
    mine: mine ? { id: mine.id, rating: mine.rating, body: mine.body, status: mine.status, updatedAt: mine.updatedAt.toISOString() } : null,
    eligibility: viewerUserId ? await reviewEligibility(viewerUserId, eventId) : null,
    canModerate: isOrg,
    items: rows
      .filter((r) => isOrg || r.status === 'VISIBLE' || r.userId === viewerUserId) // authors still see their own hidden review (with a notice)
      .map<ReviewItem>((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        author: { id: r.user.id, displayName: r.user.displayName },
        isMine: viewerUserId === r.userId,
      })),
  }
}

export async function upsertReview(params: { eventId: string; userId: string; rating: number; body?: string }) {
  const eligibility = await reviewEligibility(params.userId, params.eventId)
  if (!eligibility.eligible) {
    throw errors.conflict(
      eligibility.reason === 'ENDED'
        ? 'Reviews open once the event has ended.'
        : 'Only attendees with fulfilled tickets can review this event.'
    )
  }
  const rating = Math.round(params.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw errors.badRequest('Rating must be between 1 and 5.')
  const body = params.body?.trim().slice(0, 600) || null
  if (body !== null && body.length < 2) throw errors.badRequest('Review text is too short.')

  const existing = await db.eventReview.findUnique({ where: { eventId_userId: { eventId: params.eventId, userId: params.userId } } })
  const row = existing
    ? await db.eventReview.update({ where: { id: existing.id }, data: { rating, body }, include: { user: { select: { id: true, displayName: true } } } })
    : await db.eventReview.create({ data: { eventId: params.eventId, userId: params.userId, rating, body }, include: { user: { select: { id: true, displayName: true } } } })

  return {
    created: !existing,
    review: {
      id: row.id, rating: row.rating, body: row.body, status: row.status,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      author: { id: row.user.id, displayName: row.user.displayName }, isMine: true,
    } satisfies ReviewItem,
  }
}

export async function setReviewStatus(params: { reviewId: string; to: 'VISIBLE' | 'HIDDEN' }) {
  const review = await db.eventReview.findUnique({ where: { id: params.reviewId }, include: { user: { select: { id: true, displayName: true } } } })
  if (!review) throw errors.notFound('Review not found.')
  const row = await db.eventReview.update({ where: { id: params.reviewId }, data: { status: params.to } })
  return {
    review: {
      id: row.id, rating: row.rating, body: row.body, status: row.status,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      author: { id: review.user.id, displayName: review.user.displayName }, isMine: false,
    } satisfies ReviewItem,
  }
}
