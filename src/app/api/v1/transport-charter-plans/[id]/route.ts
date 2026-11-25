import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'transport-charter-cancel',20,60000)
  const raw=await readJson(req)
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {action?:unknown}).action!=='CANCEL')throw errors.badRequest('Only cancellation is supported.')
  return db.$transaction(async tx=>{
   const row=await tx.transportCharterPlan.findFirst({where:{id,customerId:user.id},select:{state:true}})
   if(!row)throw errors.notFound('Plan unavailable.')
   const result=await tx.transportCharterPlan.updateMany({where:{id,customerId:user.id,state:'DRAFT'},data:{state:'CANCELLED'}})
   if(result.count)await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'charter-planner',action:'transport-charter.cancel',entityType:'TransportCharterPlan',entityId:id}})
   return jsonOk({id,state:'CANCELLED',bookingEnabled:false})
  })
 })
}
