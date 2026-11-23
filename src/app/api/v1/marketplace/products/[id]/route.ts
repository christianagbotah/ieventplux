import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, readJson, rateLimit } from '@/server/api'
import { setProductPublication } from '@/server/services/marketplace'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
  return handle(async()=>{
    const {id}=await ctx.params
    const user=await requireUser()
    await rateLimit(req,'marketplace-product-publish',25,60000)
    const body=await readJson<{status?:unknown}>(req)
    if(body.status!=='ACTIVE'&&body.status!=='ARCHIVED'&&body.status!=='DRAFT')
      throw errors.badRequest('Choose a valid product publication state.')
    return jsonOk({product:await setProductPublication(id,user.id,body.status)})
  })
}
