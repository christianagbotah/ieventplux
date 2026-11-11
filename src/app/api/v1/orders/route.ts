import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { createOrder } from '@/server/services/ordering'

/**
 * POST /api/v1/orders — create an order with inventory reservations.
 * GET  /api/v1/orders — my order history.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    rateLimit(req, 'checkout', 20, 60_000)
    const user = await requireUser()
    const body = await readJson<{
      eventId?: string
      items?: { ticketTypeId: string; qty: number }[]
      buyerName?: string
      buyerEmail?: string
      buyerPhone?: string
      discountCode?: string
    }>(req)
    const event = await db.event.findUnique({ where: { id: String(body.eventId ?? '') } })
    if (!event) throw errors.notFound('Event not found.')
    if (event.visibility === 'INVITE_ONLY') {
      // Invitation-only: require an approved RSVP tied to this user.
      const rsvp = await db.rsvp.findFirst({ where: { eventId: event.id, userId: user.id, status: 'APPROVED' } })
      if (!rsvp) throw errors.forbidden('This event is invitation-only. A valid invitation is required.')
    }
    const result = await createOrder({
      eventId: event.id,
      userId: user.id,
      buyerName: String(body.buyerName ?? user.displayName).slice(0, 120),
      buyerEmail: String(body.buyerEmail ?? user.email).toLowerCase().slice(0, 160),
      buyerPhone: body.buyerPhone ? String(body.buyerPhone).slice(0, 24) : user.phone,
      discountCode: body.discountCode ? String(body.discountCode).toUpperCase() : null,
      items: Array.isArray(body.items) ? body.items : [],
    })
    return jsonOk(result)
  })
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    void req
    const orders = await db.order.findMany({
      where: { userId: user.id },
      include: {
        event: { select: { title: true, slug: true, startsAt: true, coverImageUrl: true, city: true } },
        items: { include: { ticketType: { select: { name: true } } } },
        payments: { select: { status: true, provider: true, attemptNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return jsonOk({ items: orders })
  })
}
