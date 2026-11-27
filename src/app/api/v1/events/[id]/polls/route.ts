import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { engagementAccess } from '@/server/engagement-access'
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
    const session = await getSession()
    const {organizer:isOrg}=await engagementAccess(id,session?.user.id??null)
    const polls = await listPolls(id, session?.user.id ?? null, isOrg)
    return jsonOk({ polls, isOrg },{headers:{'Cache-Control':'private, no-store'}})
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
