import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, readJson, rateLimit } from '@/server/api'
import { MarketplacePolicyError } from '@/server/marketplace-policy'
import { adjustVariantStock, variantStockHistory } from '@/server/services/marketplace'
type Context={params:Promise<{id:string}>}

/** Private seller-only append-only stock movement log. */
export async function GET(_req:NextRequest,ctx:Context){
  return handle(async()=>{
    const {id}=await ctx.params
    const user=await requireUser()
    return jsonOk({movements:await variantStockHistory(id,user.id)})
  })
}

/** Idempotent stock receive/adjustment; signed quantity, reason, operation key. */
export async function POST(req:NextRequest,ctx:Context){
  return handle(async()=>{
    const {id}=await ctx.params
    const user=await requireUser()
    await rateLimit(req,'marketplace-stock-change',35,60000)
    const raw=await readJson<unknown>(req)
    try {
      const stock=await adjustVariantStock(id,user.id,raw)
      return jsonOk({stock},{status:stock.applied?201:200})
    } catch(e) {
      if(e instanceof MarketplacePolicyError)throw errors.badRequest(e.message)
      throw e
    }
  })
}
