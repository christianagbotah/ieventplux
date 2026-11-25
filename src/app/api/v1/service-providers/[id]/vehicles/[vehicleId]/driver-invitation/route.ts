import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,errors} from '@/server/api'
import {newDriverInvitation} from '@/server/transport-driver-policy'
type Context={params:Promise<{id:string;vehicleId:string}>}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,vehicleId}=await ctx.params
  await rateLimit(req,'fleet-driver-invite',8,60000)
  try{return await db.$transaction(async tx=>{
   const vehicle=await tx.transportVehicle.findFirst({where:{id:vehicleId,providerId:id,state:'DRAFT',provider:{ownerId:user.id,reviewStatus:{in:['PENDING','APPROVED']},owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}}}},select:{id:true}})
   if(!vehicle)throw errors.notFound('Vehicle unavailable.')
   const now=new Date()
   await tx.transportDriverAssignment.updateMany({where:{vehicleId,state:'INVITED',expiresAt:{lte:now}},data:{state:'ENDED',endedAt:now}})
   if(await tx.transportDriverAssignment.findFirst({where:{vehicleId,state:{in:['INVITED','ACCEPTED']}}}))throw errors.conflict('End the existing assignment or invitation first.')
   const {token,inviteHash,expiresAt}=newDriverInvitation(now)
   const item=await tx.transportDriverAssignment.create({data:{vehicleId,inviteHash,expiresAt},select:{id:true,expiresAt:true,state:true}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'fleet-owner',action:'transport-driver.invite',entityType:'TransportVehicle',entityId:vehicleId,after:JSON.stringify({assignmentId:item.id})}})
   return jsonOk({item,token,dispatchEnabled:false,certificationEnabled:false},{status:201,headers:{'Cache-Control':'private, no-store'}})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Assignment changed; refresh and retry.');throw e}
 })
}
