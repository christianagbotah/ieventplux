import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { eventOrgAccess } from '@/server/permissions'
import { listPolls, createPoll } from '@/server/services/live-engagement'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET  /api/v1/events/[id]/polls — polls with live tallies.
 *      Attendees see OPEN + CLOSED; org staff additionally see DRAFTs.
 * POST /api/v1/events/[id]/polls — create a DRAFT poll (org, event:edit).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const event = await db.event.findUnique({ where: { id }, select: { id: true, orgId: true, deletedAt: true, visibility: true } })
    if (!event || event.deletedAt) throw errors.notFound('Event not found.')

    const session = await getSession()
    if (event.visibility === 'INVITE_ONLY' && !session) throw errors.notFound('Event not found.')

    const isOrg = session ? Boolean(await db.membership.findFirst({ where: { userId: session.user.id, orgId: event.orgId } })) : false
    const polls = await listPolls(id, session?.user.id ?? null, isOrg)
    return jsonOk({ polls, isOrg })
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'poll-create', 20, 60_000)
    const body = await readJson<{ question?: unknown; options?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)

    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Only the event organizers can create polls.')

    const question = sanitizeText(body.question, 140)
    const options = Array.isArray(body.options) ? body.options.map((o) => sanitizeText(o, 40)) : []
    const poll = await createPoll({ eventId: id, userId: user.id, question, options })
    return jsonOk({ poll })
  })
}
