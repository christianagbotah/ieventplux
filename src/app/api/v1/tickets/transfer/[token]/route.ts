import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ token: string }> }

/** POST /api/v1/tickets/transfer/[token] — claim a transferred ticket. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    rateLimit(req, 'transfer', 10, 60_000)
    const { token } = await ctx.params
    const user = await requireUser()
    const ticket = await db.ticket.findFirst({ where: { transferToken: token } })
    if (!ticket) throw errors.notFound('This transfer link is invalid.')
    if (ticket.status !== 'VALID') throw errors.conflict('This ticket can no longer be claimed.')
    if (ticket.userId === user.id) throw errors.badRequest('This ticket already belongs to you.')

    await db.$transaction(async (tx) => {
      const fresh = await tx.ticket.findUnique({ where: { id: ticket.id } })
      if (!fresh || fresh.transferToken !== token) throw errors.conflict('This transfer was already claimed.')
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { userId: user.id, holderName: user.displayName, holderEmail: user.email, transferToken: null, transferredFrom: ticket.userId },
      })
    })
    const { notifyUser } = await import('@/server/services/notify')
    if (ticket.userId) {
      await notifyUser({ userId: ticket.userId, type: 'TICKET_TRANSFERRED', title: 'Ticket transferred', body: 'Your ticket was claimed by its new holder.', link: '#/me?tab=tickets' }).catch(() => {})
    }
    return jsonOk({ claimed: true, ticketId: ticket.id })
  })
}
