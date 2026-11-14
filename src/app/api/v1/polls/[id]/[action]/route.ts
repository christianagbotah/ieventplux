import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { setPollStatus, castVote } from '@/server/services/live-engagement'
import { audit } from '@/server/audit'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * POST /api/v1/polls/[id]/open  — org: open while the event is LIVE (auto-closes other open polls).
 * POST /api/v1/polls/[id]/close — org: close the open poll.
 * POST /api/v1/polls/[id]/vote — signed-in attendee: one vote per poll (409 on repeat).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ optionId?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)

    if (action === 'vote') {
      await rateLimit(req, 'poll-vote', 30, 60_000)
      const optionId = String(body.optionId ?? '')
      if (!optionId) throw errors.badRequest('Choose an option to vote.')
      const result = await castVote({ pollId: id, optionId, userId: user.id })
      return jsonOk(result)
    }

    if (action === 'open' || action === 'close') {
      const poll = await db.livePoll.findUnique({ where: { id }, select: { eventId: true } })
      if (!poll) throw errors.notFound('Poll not found.')
      const access = await eventOrgAccess(user.id, poll.eventId, 'event:edit')
      if (!access.allowed) throw errors.forbidden('Only the event organizers can manage polls.')
      const result = await setPollStatus({ pollId: id, to: action === 'open' ? 'OPEN' : 'CLOSED', userId: user.id })
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `poll.${action}`, entityType: 'LivePoll', entityId: id })
      return jsonOk(result)
    }

    throw errors.notFound('Unknown poll action.')
  })
}
