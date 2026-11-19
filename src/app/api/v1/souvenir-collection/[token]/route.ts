import { NextRequest } from 'next/server'
import { errors, handle, jsonOk, rateLimit, readJson, requireUser } from '@/server/api'
import { collectSouvenirItems, getSouvenirCollection } from '@/server/services/souvenir-collection'
import { merchandiseCollectionEnabled } from '@/server/souvenir-policy'

type Context = { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'souvenir-lookup', 100, 60_000)
    const user = await requireUser()
    const { token } = await ctx.params
    return jsonOk(await getSouvenirCollection(token, user.id), { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'souvenir-collect', 80, 60_000)
    const user = await requireUser()
    if (!merchandiseCollectionEnabled()) {
      throw errors.unavailable('SOUVENIR_COLLECTION_PENDING_QA', 'Collection confirmation is not activated until payment, refund and event-day QA pass.')
    }
    const { token } = await ctx.params
    const body = await readJson<{ orderItemId?: string; qty?: number; clientActionId?: string }>(req)
    if (!body.orderItemId || !body.clientActionId) throw errors.badRequest('Choose the product and provide a collection action ID.')
    return jsonOk(await collectSouvenirItems({ token, userId: user.id, orderItemId: body.orderItemId,
      qty: body.qty ?? 1, clientActionId: body.clientActionId }))
  })
}
