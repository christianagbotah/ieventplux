import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
type Context={params:Promise<{id:string;departureId:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,departureId}=await ctx.params
  await rateLimit(req,'transport-departure-cancel',20,60000)
  const raw=await readJson(req)
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {action?:unknown}).action!=='CANCEL')throw errors.badRequest('Only cancellation is supported.')
  return db.$transaction(async tx=>{
   const where={id:departureId,route:{providerId:id,provider:{ownerId:user.id}},vehicle:{providerId:id}}
   if(!await tx.transportDepartureDraft.findFirst({where,select:{id:true}}))throw errors.notFound('Departure unavailable.')
   const result=await tx.transportDepartureDraft.updateMany({where:{...where,state:'DRAFT'},data:{state:'CANCELLED'}})
   if(result.count)await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-departure.cancel',entityType:'TransportDepartureDraft',entityId:departureId}})
   return jsonOk({id:departureId,state:'CANCELLED',bookingEnabled:false})
  })
 })
}
