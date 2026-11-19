import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, jsonOk, requireUser, rateLimit, readJson, errors } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { souvenirCollectionToken, souvenirCheckoutEnabled } from '@/server/souvenir-policy'

/** Enter a printed receipt reference without asking the customer for a QR.
 * A reference is not an access credential: only an authenticated, accepted
 * event check-in staff member may turn it into a signed collection lookup.
 * It never confirms payment or changes stock/admission state. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    if (!souvenirCheckoutEnabled()) throw errors.unavailable('SOUVENIR_COLLECTION_DISABLED', 'Souvenir collection is not yet available.')
    await rateLimit(req, 'souvenir-reference-lookup', 30, 60_000)
    const input = await readJson<{ reference?: unknown }>(req)
    const entered = typeof input.reference === 'string' ? input.reference.trim().toUpperCase() : ''
    const reference = entered.startsWith('RCPT-') ? entered.slice(5) : entered
    if (!/^ORD-[A-Z0-9-]{6,52}$/.test(reference)) throw errors.badRequest('Enter a valid receipt reference.')
    const order = await db.order.findUnique({
      where: { reference }, select: { eventId: true, souvenirItems: { select: { id: true }, take: 1 } },
    })
    if (!order || !order.souvenirItems.length) throw errors.notFound('No souvenir receipt found.')
    const access = await eventOrgAccess(user.id, order.eventId, 'checkin:scan')
    if (!access.allowed) throw errors.forbidden('Only accepted staff at the organizing event can look up this receipt.')
    return jsonOk({ token: souvenirCollectionToken(reference) }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
