import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { souvenirPayload } from '@/server/event-programme-policy'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string; productId: string }> }
export async function PATCH(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, productId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.allowed) throw errors.forbidden('Merchandise inventory requires event-manager permission.')
    const product = await db.eventSouvenirProduct.findFirst({ where: { id: productId, eventId: id } })
    if (!product) throw errors.notFound('Souvenir product not found.')
    const body = await readJson<Record<string, unknown>>(req)
    const data = souvenirPayload({ ...product, ...body }, product)
    if (data.sku !== product.sku) {
      const taken = await db.eventSouvenirProduct.findUnique({ where: { eventId_sku: { eventId: id, sku: data.sku } }, select: { id: true } })
      if (taken && taken.id !== product.id) throw errors.conflict('The SKU is already in use by another product.')
    }
    return jsonOk({ item: await db.eventSouvenirProduct.update({ where: { id: product.id }, data }) })
  })
}
export async function DELETE(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, productId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'tickets:manage')
    if (!access.allowed) throw errors.forbidden('Merchandise inventory requires event-manager permission.')
    const previous = await db.eventSouvenirProduct.findFirst({ where: { id: productId, eventId: id } })
    if (!previous) throw errors.notFound('Souvenir product not found.')
    await db.eventSouvenirProduct.update({ where: { id: previous.id }, data: { active: false } })
    return jsonOk({ deactivated: true, note: 'The product was hidden; inventory history was preserved.' })
  })
}
