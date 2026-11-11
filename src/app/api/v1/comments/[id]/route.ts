import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

/** POST /api/v1/comments/[id] — delete own comment (or org staff moderation). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const user = await requireUser()
    const comment = await db.comment.findUnique({ where: { id }, include: { event: { select: { orgId: true } } } })
    if (!comment) throw errors.notFound('Comment not found.')
    let allowed = comment.userId === user.id
    if (!allowed) {
      const membership = await db.membership.findFirst({ where: { userId: user.id, orgId: comment.event.orgId } })
      if (membership) allowed = true
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
    const session = await getSession()
    const comment = await db.comment.findUnique({ where: { id }, include: { user: { select: { displayName: true } } } })
    if (!comment || comment.status !== 'VISIBLE') throw errors.notFound('Comment not found.')
    return jsonOk({ comment })
  })
}
