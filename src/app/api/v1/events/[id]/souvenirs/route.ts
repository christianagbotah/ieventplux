import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { canViewProgramme } from '@/server/event-operations-access'
import { souvenirPayload } from '@/server/event-programme-policy'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const { member } = await canViewProgramme(id)
    const items = await db.eventSouvenirProduct.findMany({
      where: { eventId: id, ...(member ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 150,
    })
    return jsonOk({ items: items.map((product) => ({
      ...product, available: Math.max(0, product.stockTotal - product.stockReserved - product.stockSold),
      onlineOrderingEnabled: false, // Payment reservation and fulfilment are NOT active yet.
    })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    await rateLimit(req, 'event-operations-author', 40, 60_000)
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('Merchandise inventory requires event-manager permission.')
    const count = await db.eventSouvenirProduct.count({ where: { eventId: id } })
    if (count >= 150) throw errors.conflict('Limit reached: 150 products per event.')
    const data = souvenirPayload(await readJson<Record<string, unknown>>(req))
    const exists = await db.eventSouvenirProduct.findUnique({ where: { eventId_sku: { eventId: id, sku: data.sku } }, select: { id: true } })
    if (exists) throw errors.conflict('This SKU is already used in the event; choose another size/color code.')
    return jsonOk({ item: await db.eventSouvenirProduct.create({ data: { eventId: id, ...data } }) })
  })
}
