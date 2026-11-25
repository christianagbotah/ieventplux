import {NextRequest} from 'next/server'
import {errors,handle,jsonOk,rateLimit,readJson,requireUser} from '@/server/api'
import {MarketplaceQuoteError} from '@/server/marketplace-quote-policy'
import {createPurchaseRequest,listPurchaseRequests} from '@/server/services/marketplace-requests'
type Context={params:Promise<{slug:string}>}
export async function GET(req:NextRequest,ctx:Context){
  return handle(async()=>{
    const user=await requireUser()
    await rateLimit(req,'marketplace-request-list',60,60000)
    const {slug}=await ctx.params
    return jsonOk(await listPurchaseRequests(slug,user.id),{headers:{'Cache-Control':'private, no-store'}})
  })
}
export async function POST(req:NextRequest,ctx:Context){
  return handle(async()=>{
    const user=await requireUser()
    await rateLimit(req,'marketplace-request-create',15,60000)
    const {slug}=await ctx.params
    try{
      const result=await createPurchaseRequest(slug,user.id,await readJson<unknown>(req))
      return jsonOk({...result,checkoutEnabled:false,inventoryReserved:false},{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}})
    }catch(e){if(e instanceof MarketplaceQuoteError)throw errors.badRequest(e.message);throw e}
  })
}
