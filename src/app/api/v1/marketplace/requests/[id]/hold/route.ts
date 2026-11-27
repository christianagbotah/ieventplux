import {NextRequest} from 'next/server'
import {handle,jsonOk,requireUser,rateLimit} from '@/server/api'
import {reserveMarketplaceRequest,releaseMarketplaceRequest} from '@/server/services/marketplace-holds'
type Context={params:Promise<{id:string}>}
export async function POST(req:NextRequest,ctx:Context){return handle(async()=>{const user=await requireUser();await rateLimit(req,'marketplace-hold-create',15,60000);return jsonOk(await reserveMarketplaceRequest((await ctx.params).id,user.id),{headers:{'Cache-Control':'private, no-store'}})})}
export async function DELETE(req:NextRequest,ctx:Context){return handle(async()=>{const user=await requireUser();await rateLimit(req,'marketplace-hold-release',30,60000);return jsonOk(await releaseMarketplaceRequest((await ctx.params).id,user.id),{headers:{'Cache-Control':'private, no-store'}})})}
