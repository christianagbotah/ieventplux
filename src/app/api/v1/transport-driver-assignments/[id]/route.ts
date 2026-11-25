import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'driver-assignment-end',20,60000)
  const raw=await readJson(req)
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {action?:unknown}).action!=='END')throw errors.badRequest('Only ending an assignment is supported.')
  try{return await db.$transaction(async tx=>{
   const row=await tx.transportDriverAssignment.findFirst({where:{id,OR:[{driverId:user.id},{vehicle:{provider:{ownerId:user.id}}}]}})
   if(!row)throw errors.notFound('Assignment unavailable.')
   if(row.state!=='ENDED'){
    await tx.transportDriverAssignment.update({where:{id},data:{state:'ENDED',endedAt:new Date()}})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'assignment-participant',action:'transport-driver.end',entityType:'TransportVehicle',entityId:row.vehicleId,after:JSON.stringify({assignmentId:id})}})
   }
   return jsonOk({id,state:'ENDED',dispatchEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Assignment changed; refresh and retry.');throw e}
 })
}
