import {NextRequest} from 'next/server'
import {handle,jsonOk,readJson,rateLimit,errors} from '@/server/api'
import {nearbyStores} from '@/server/services/marketplace'
import {MarketplacePolicyError} from '@/server/marketplace-policy'
export async function POST(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'marketplace-nearby',30,60000)
  try{return jsonOk({...await nearbyStores(await readJson(req)),checkoutEnabled:false},{headers:{'Cache-Control':'private, no-store'}})}
  catch(error){if(error instanceof MarketplacePolicyError)throw errors.badRequest(error.message);throw error}
 })
}
