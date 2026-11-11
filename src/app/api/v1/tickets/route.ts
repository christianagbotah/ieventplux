import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { qrSvg } from '@/server/qr'

/** GET /api/v1/tickets — my tickets (supports offline caching via cache-busted fetch). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, offset } = pagination(req, 20, 50)
    const items = await db.ticket.findMany({
      where: { userId: user.id },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, timezone: true, venue: { select: { name: true, city: true } }, org: { select: { name: true } } } },
        ticketType: { select: { name: true, kind: true } },
      },
      orderBy: [{ event: { startsAt: 'asc' } }],
      skip: offset,
      take: pageSize,
    })
    const total = await db.ticket.count({ where: { userId: user.id } })
    return jsonList(items, total, page, pageSize)
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    void req
    throw errors.notFound('Use /api/v1/tickets/[id] for a single ticket.')
  })
}
