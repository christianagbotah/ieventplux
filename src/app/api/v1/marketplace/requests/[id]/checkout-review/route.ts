import {NextRequest} from 'next/server'
import {handle,jsonOk,requireUser,rateLimit} from '@/server/api'
import {reviewMarketplaceCheckout} from '@/server/services/marketplace-checkout-review'
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser();await rateLimit(req,'marketplace-checkout-review',30,60000);return jsonOk(await reviewMarketplaceCheckout((await ctx.params).id,user.id),{headers:{'Cache-Control':'private, no-store'}})})}
