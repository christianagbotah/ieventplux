import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, rateLimit, sanitizeText } from '@/server/api'
import { engagementAccess } from '@/server/engagement-access'
import { getSession } from '@/server/auth'
import { listQuestions, askQuestion } from '@/server/services/live-engagement'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET  /api/v1/events/[id]/questions — audience Q&A list.
 *      Attendees see NEW + ANSWERED; org staff additionally see HIDDEN (moderation).
 * POST /api/v1/events/[id]/questions — ask a question (signed-in, rate-limited).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const session = await getSession()
    const {organizer:isOrg}=await engagementAccess(id,session?.user.id??null)
    const questions = await listQuestions(id, session?.user.id ?? null, isOrg)
    return jsonOk({ questions, isOrg },{headers:{'Cache-Control':'private, no-store'}})
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'qa-ask', 10, 60_000)
    const body = await readJson<{ body?: unknown }>(req).catch(() => ({}) as Record<string, unknown>)
    const question = await askQuestion({ eventId: id, userId: user.id, body: sanitizeText(body.body, 280) })
    return jsonOk({ question })
  })
}
