import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { toggleUpvote, answerQuestion, moderateQuestion } from '@/server/services/live-engagement'
import { audit } from '@/server/audit'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * POST /api/v1/questions/[id]/upvote — signed-in attendee: toggles their upvote (own questions excluded).
 * POST /api/v1/questions/[id]/answer  — org: publish an answer.
 * POST /api/v1/questions/[id]/hide|unhide|pin|unpin — org moderation.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ answer?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)

    if (action === 'upvote') {
      await rateLimit(req, 'qa-upvote', 60, 60_000)
      const result = await toggleUpvote({ questionId: id, userId: user.id })
      return jsonOk(result)
    }

    // Organizer-only actions below.
    const question = await db.audienceQuestion.findUnique({ where: { id }, select: { eventId: true } })
    if (!question) throw errors.notFound('Question not found.')
    const access = await eventOrgAccess(user.id, question.eventId, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Only the event organizers can moderate the Q&A.')

    if (action === 'answer') {
      const result = await answerQuestion({ questionId: id, userId: user.id, answer: sanitizeText(body.answer, 600) })
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'question.answer', entityType: 'AudienceQuestion', entityId: id })
      return jsonOk(result)
    }

    if (action === 'hide' || action === 'unhide' || action === 'pin' || action === 'unpin') {
      const verb = action.toUpperCase().replace('-', '_') as 'HIDE' | 'UNHIDE' | 'PIN' | 'UNPIN'
      const result = await moderateQuestion({ questionId: id, action: verb })
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `question.${action}`, entityType: 'AudienceQuestion', entityId: id })
      return jsonOk(result)
    }

    throw errors.notFound('Unknown question action.')
  })
}
