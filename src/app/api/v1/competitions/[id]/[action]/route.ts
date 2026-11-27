import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, errors, rateLimit, readJson } from '@/server/api'
import { requireCommunityAccess } from '@/server/community-access'
import { eventOrgAccess } from '@/server/permissions'
import { castCompetitionVote, changeCompetitionStatus } from '@/server/services/competitions'

type Context = { params: Promise<{ id: string; action: string }> }

/**
 * /api/v1/competitions/[id]/vote  — free, once per user per category.
 * /api/v1/competitions/[id]/open  — authorized event organizer only.
 * /api/v1/competitions/[id]/close — authorized event organizer only.
 */
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, action } = await ctx.params
    if (action !== 'vote' && action !== 'open' && action !== 'close') throw errors.notFound()
    const user = await requireUser()
    await rateLimit(req, action === 'vote' ? 'competition-vote' : 'competition-manage',
      action === 'vote' ? 18 : 12, 60_000)
    const contest = await db.eventCompetition.findUnique({
      where: { id }, select: { eventId: true },
    })
    if (!contest) throw errors.notFound('Competition not found.')
    await requireCommunityAccess(contest.eventId)

    if (action === 'vote') {
      const body = await readJson<{ categoryId?: unknown; nomineeId?: unknown }>(req)
      const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
      const nomineeId = typeof body.nomineeId === 'string' ? body.nomineeId : ''
      if (!categoryId || !nomineeId) throw errors.badRequest('Select a nominee and award category.')
      const result = await castCompetitionVote({
        competitionId: id, categoryId, nomineeId, userId: user.id,
      })
      return jsonOk(result, { status: 201 })
    }

    const access = await eventOrgAccess(user.id, contest.eventId, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Organizer permission required to manage voting.')
    const result = await changeCompetitionStatus(id, user.id, action === 'open' ? 'OPEN' : 'CLOSED')
    return jsonOk(result)
  })
}
