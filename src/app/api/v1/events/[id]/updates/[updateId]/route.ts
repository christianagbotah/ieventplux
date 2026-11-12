import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser } from '@/server/api'
import { deleteUpdate } from '@/server/services/updates'

type RouteContext = { params: Promise<{ id: string; updateId: string }> }

/**
 * DELETE /api/v1/events/[id]/updates/[updateId] — organizer removal of an update.
 * Org-scoped (event:edit), audited, and relayed to open event pages in realtime.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, updateId } = await ctx.params
    const user = await requireUser()
    const result = await deleteUpdate(updateId, user.id, user.email, id)
    return jsonOk(result)
  })
}
