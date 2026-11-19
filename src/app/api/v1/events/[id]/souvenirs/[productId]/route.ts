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
    // Check stock under the same row lock used by concurrent checkout holds.
    // The organizer may not reduce inventory below already sold+reserved stock,
    // nor silently reprice units held by customers or already sold.
    const updated = await db.$executeRaw`
      UPDATE "EventSouvenirProduct"
      SET "name" = ${data.name}, "sku" = ${data.sku},
        "variantLabel" = ${data.variantLabel}, "description" = ${data.description},
        "imageUrl" = ${data.imageUrl}, "priceMinor" = ${data.priceMinor},
        "stockTotal" = ${data.stockTotal}, "active" = ${data.active},
        "sortOrder" = ${data.sortOrder}, "updatedAt" = NOW()
      WHERE "id" = ${product.id} AND "eventId" = ${id}
        AND "stockSold" + "stockReserved" <= ${data.stockTotal}
        AND ("stockSold" + "stockReserved" = 0 OR "priceMinor" = ${data.priceMinor})
    `
    if (updated !== 1) throw errors.conflict('Inventory changed during editing. Refresh the product; stock cannot fall below paid or reserved items.')
    return jsonOk({ item: await db.eventSouvenirProduct.findUnique({ where: { id: product.id } }) })
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
