import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { requireCommunityAccess } from '@/server/community-access'
import { CompetitionPolicyError } from '@/server/competition-policy'
import { reviseDraftCompetition, discardDraftCompetition } from '@/server/services/competitions'

type Context = { params: Promise<{ id: string }> }

/** Draft-only edit; nomination changes after opening would undermine votes. */
export async function PATCH(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'competition-edit', 16, 60_000)
    const competition = await db.eventCompetition.findUnique({
      where: { id }, select: { eventId: true },
    })
    if (!competition) throw errors.notFound('Competition not found.')
    await requireCommunityAccess(competition.eventId)
    const permission = await eventOrgAccess(user.id, competition.eventId, 'event:edit')
    if (!permission.allowed) throw errors.forbidden('Organizer permission required.')
    const body = await readJson<unknown>(req)
    try {
      const result = await reviseDraftCompetition(id, user.id, body)
      return jsonOk({ competition: result })
    } catch (cause) {
      if (cause instanceof CompetitionPolicyError) throw errors.badRequest(cause.message)
      throw cause
    }
  })
}

/** Destructive actions are restricted to unvoted organizer drafts. */
export async function DELETE(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'competition-delete', 10, 60_000)
    const competition = await db.eventCompetition.findUnique({ where: { id }, select: { eventId: true } })
    if (!competition) throw errors.notFound('Competition not found.')
    await requireCommunityAccess(competition.eventId)
    const permission = await eventOrgAccess(user.id, competition.eventId, 'event:edit')
    if (!permission.allowed) throw errors.forbidden('Organizer permission required.')
    const result = await discardDraftCompetition(id,user.id)
    return jsonOk({ removed: result.removed })
  })
}
