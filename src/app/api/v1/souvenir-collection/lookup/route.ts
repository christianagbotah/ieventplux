import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { souvenirCollectionToken } from '@/server/souvenir-policy'

/** Manual receipt-number fallback for staff when customers have no QR display.
 * Only accepted event staff may resolve the code into a signed lookup link. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await rateLimit(req, 'souvenir-ref-lookup', 30, 60_000)
    const user = await requireUser()
    const reference = new URL(req.url).searchParams.get('reference')?.trim().toUpperCase() ?? ''
    if (!/^ORD-[A-Z0-9-]{6,52}$/.test(reference)) throw errors.badRequest('Enter a valid receipt reference.')
    const order = await db.order.findUnique({ where: { reference }, select: { eventId: true, souvenirItems: { select: { id: true }, take: 1 } } })
    if (!order || !order.souvenirItems.length) throw errors.notFound('No souvenir receipt was found for that reference.')
    const access = await eventOrgAccess(user.id, order.eventId, 'checkin:scan')
    if (!access.allowed) throw errors.forbidden('Only assigned event staff may look up receipt numbers.')
    return jsonOk({ token: souvenirCollectionToken(reference) }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
