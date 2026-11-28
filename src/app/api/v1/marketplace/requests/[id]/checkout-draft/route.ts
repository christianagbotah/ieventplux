import {NextRequest} from 'next/server'
import {handle,jsonOk,requireUser,rateLimit,readJson} from '@/server/api'
import {prepareMarketplaceCheckout} from '@/server/services/marketplace-checkout-drafts'
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser();await rateLimit(req,'marketplace-checkout-draft',20,60000);const result=await prepareMarketplaceCheckout((await ctx.params).id,user.id,await readJson(req));return jsonOk(result,{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}})})}
