import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {parseFleetAction} from '@/server/transport-fleet-policy'
type Context={params:Promise<{id:string;vehicleId:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,vehicleId}=await ctx.params
  await rateLimit(req,'transport-fleet-archive',20,60000)
  let state
  try{state=parseFleetAction(await readJson(req))}catch{throw errors.badRequest('Only archival is available.')}
  try{return await db.$transaction(async tx=>{
   const row=await tx.transportVehicle.findFirst({where:{id:vehicleId,providerId:id,provider:{ownerId:user.id,owner:{status:'ACTIVE',deletedAt:null}}}})
   if(!row)throw errors.notFound('Vehicle unavailable.')
   if(row.state==='DRAFT'){
    await tx.transportDepartureDraft.updateMany({where:{vehicleId,state:'DRAFT'},data:{state:'CANCELLED'}})
    await tx.transportDriverAssignment.updateMany({where:{vehicleId,state:{in:['INVITED','ACCEPTED']}},data:{state:'ENDED',endedAt:new Date()}})

    await tx.transportVehicle.update({where:{id:vehicleId},data:{state}})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-vehicle.archive',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({vehicleId,state})}})
   }
   return jsonOk({id:vehicleId,state,dispatchEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Fleet changed; refresh and retry.');throw e}
 })
}
