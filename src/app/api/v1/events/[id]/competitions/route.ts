import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { requireCommunityAccess } from '@/server/community-access'
import { CompetitionPolicyError } from '@/server/competition-policy'
import { createEventCompetition, competitionSnapshot } from '@/server/services/competitions'
import {getSession} from '@/server/auth'

type Context = { params: Promise<{ id: string }> }

/** Event awards and nominations; drafts and private event data remain gated. */
export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const session=await getSession()
    return jsonOk(await competitionSnapshot(id,session?.user.id??null),{headers:{'Cache-Control':'private, no-store'}})
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'competition-create', 10, 60_000)
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Only authorized event organizers can create award competitions.')
    await requireCommunityAccess(id)
    const body = await readJson<unknown>(req)
    try {
      const competition = await createEventCompetition(id, user.id, body)
      return jsonOk({ competition }, { status: 201 })
    } catch (error) {
      if (error instanceof CompetitionPolicyError) throw errors.badRequest(error.message)
      throw error
    }
  })
}
