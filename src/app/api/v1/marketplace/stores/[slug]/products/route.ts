import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, readJson, rateLimit } from '@/server/api'
import { getSession } from '@/server/auth'
import { MarketplacePolicyError } from '@/server/marketplace-policy'
import { createProduct, getStoreCatalogue } from '@/server/services/marketplace'

type Context = { params: Promise<{ slug: string }> }

/** Public catalogue inherits the same owner/public state filters as store GET. */
export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const {slug} = await ctx.params
    const session = await getSession()
    const data = await getStoreCatalogue(slug,session?.user.id ?? null)
    return jsonOk({store:data.store,products:data.products,canManage:data.canManage,
      checkoutEnabled:false})
  })
}
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const {slug} = await ctx.params
    const user = await requireUser()
    await rateLimit(req,'marketplace-product-create',30,60000)
    const raw = await readJson<unknown>(req)
    try {
      const product=await createProduct(slug,user.id,raw)
      return jsonOk({product},{status:201})
    } catch(e) {
      if(e instanceof MarketplacePolicyError) throw errors.badRequest(e.message)
      throw e
    }
  })
}
