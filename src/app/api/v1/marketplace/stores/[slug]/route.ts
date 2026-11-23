import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, readJson, rateLimit } from '@/server/api'
import { getSession } from '@/server/auth'
import { MarketplacePolicyError } from '@/server/marketplace-policy'
import { getStoreCatalogue, updateStore } from '@/server/services/marketplace'

type Context = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { slug } = await ctx.params
    const session = await getSession()
    return jsonOk(await getStoreCatalogue(slug, session?.user.id ?? null))
  })
}
export async function PATCH(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { slug } = await ctx.params
    const user = await requireUser()
    await rateLimit(req, 'marketplace-store-update', 30, 60_000)
    try {
      const raw = await readJson<unknown>(req)
      return jsonOk({store:await updateStore(slug,user.id,raw)})
    } catch(e) {
      if(e instanceof MarketplacePolicyError) throw errors.badRequest(e.message)
      throw e
    }
  })
}
