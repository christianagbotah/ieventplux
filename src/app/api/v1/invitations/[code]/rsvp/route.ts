import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ code: string }> }

/** GET /api/v1/invitations/[code]/rsvp — the signed-in user's RSVP on this invitation.
 *  Powers the #/invite/{code} status view across revisits (pending / approved / declined). */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { code } = await ctx.params
    const user = await requireUser()
    const invitation = await db.invitation.findUnique({ where: { code: code.toUpperCase() } })
    if (!invitation) throw errors.notFound('This invitation is no longer valid.')
    const rsvp = await db.rsvp.findFirst({
      where: { invitationId: invitation.id, userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({ rsvp })
  })
}
