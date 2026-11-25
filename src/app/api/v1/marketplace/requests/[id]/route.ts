import {NextRequest} from 'next/server'
import {errors,handle,jsonOk,rateLimit,readJson,requireUser} from '@/server/api'
import {MarketplaceQuoteError} from '@/server/marketplace-quote-policy'
import {decidePurchaseRequest} from '@/server/services/marketplace-requests'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'marketplace-request-decision',30,60000)
  const {id}=await ctx.params
  try{return jsonOk(await decidePurchaseRequest(id,user.id,await readJson<unknown>(req)),{headers:{'Cache-Control':'private, no-store'}})}
  catch(e){if(e instanceof MarketplaceQuoteError)throw errors.badRequest(e.message);throw e}
 })
}
