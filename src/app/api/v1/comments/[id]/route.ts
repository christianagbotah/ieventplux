import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { requireCommunityAccess } from '@/server/community-access'

/** POST /api/v1/comments/[id] — delete own comment (or org staff moderation). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const user = await requireUser()
    const comment = await db.comment.findUnique({ where: { id }, include: { event: { select: { orgId: true } } } })
    if (!comment) throw errors.notFound('Comment not found.')
    const access = await requireCommunityAccess(comment.eventId, true)
    let allowed = comment.userId === user.id
    if (!allowed) {
      if (access.organizer) allowed = true
    }
    if (!allowed) throw errors.forbidden('You can only delete your own comments.')
    await db.comment.update({ where: { id }, data: { status: 'REMOVED' } })
    return jsonOk({ removed: true })
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const comment = await db.comment.findUnique({
      where: { id },
      include: { user: { select: { id: true, displayName: true } } },
    })
    if (!comment || comment.status !== 'VISIBLE') throw errors.notFound('Comment not found.')
    await requireCommunityAccess(comment.eventId)
    return jsonOk({ comment }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
