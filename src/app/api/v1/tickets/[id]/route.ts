import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { ticketQrPayload, qrSvg } from '@/server/qr'
import { transferToken } from '@/server/ids'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/v1/tickets/[id] — ticket detail + server-generated QR SVG (no personal data inside the QR). */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const user = await requireUser()
    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, timezone: true, venue: true, org: { select: { name: true } } } },
        ticketType: { select: { name: true, kind: true, includesVirtualAccess: true } },
        scans: { orderBy: { scannedAt: 'desc' }, take: 5 },
      },
    })
    if (!ticket) throw errors.notFound('Ticket not found.')
    // Access: holder, or event-org staff (roster access).
    let allowed = ticket.userId === user.id
    if (!allowed) {
      const evt = await db.event.findUnique({ where: { id: ticket.eventId }, select: { orgId: true } })
      if (evt) {
        const m = await db.membership.findFirst({ where: { userId: user.id, orgId: evt.orgId } })
        if (m) allowed = true
      }
    }
    if (!allowed) throw errors.forbidden('This ticket belongs to another attendee.')
    const payload = ticketQrPayload(ticket.id, ticket.code)
    return jsonOk({
      ticket: {
        ...ticket,
        qrPayload: payload,
        qrSvg: await qrSvg(payload, 220),
      },
    })
  })
}

/** POST /api/v1/tickets/[id] — initiate transfer (creates a one-time claim token). */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ action?: string }>(req)
    const ticket = await db.ticket.findUnique({ where: { id } })
    if (!ticket) throw errors.notFound('Ticket not found.')
    if (ticket.userId !== user.id) throw errors.forbidden('Only the ticket holder can transfer it.')
    if (ticket.status !== 'VALID') throw errors.conflict(`A ${ticket.status.toLowerCase().replace('_', ' ')} ticket cannot be transferred.`)

    if (body.action === 'transfer') {
      const token = transferToken()
      await db.ticket.update({ where: { id }, data: { transferToken: token } })
      return jsonOk({ transferToken: token, claimUrl: `${(await import('@/server/env')).env.appUrl}/#/claim/${token}`, note: 'Share this link with the recipient. It can be claimed once.' })
    }
    throw errors.badRequest('Unknown ticket action.')
  })
}
