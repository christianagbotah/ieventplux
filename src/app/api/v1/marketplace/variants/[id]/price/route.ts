import {NextRequest} from 'next/server'
import {handle,jsonOk,requireUser,errors,readJson,rateLimit} from '@/server/api'
import {MarketplacePolicyError} from '@/server/marketplace-policy'
import {changeVariantPrice} from '@/server/services/marketplace'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
  return handle(async()=>{
    const {id}=await ctx.params
    const user=await requireUser()
    await rateLimit(req,'marketplace-variant-price',25,60000)
    try{return jsonOk({variant:await changeVariantPrice(id,user.id,await readJson<unknown>(req))})}
    catch(e){if(e instanceof MarketplacePolicyError)throw errors.badRequest(e.message);throw e}
  })
}
