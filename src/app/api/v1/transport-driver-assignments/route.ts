import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {parseDriverAcceptance,mayAcceptDriverInvitation} from '@/server/transport-driver-policy'
export const dynamic='force-dynamic'
export async function GET(){
 return handle(async()=>{
  const user=await requireUser()
  const rows=await db.transportDriverAssignment.findMany({where:{OR:[{driverId:user.id},{vehicle:{provider:{ownerId:user.id}}}]},select:{id:true,state:true,expiresAt:true,acceptedAt:true,endedAt:true,driverId:true,vehicle:{select:{id:true,label:true,vehicleClass:true,state:true,provider:{select:{ownerId:true,displayName:true}}}},driver:{select:{displayName:true}}},orderBy:{createdAt:'desc'},take:100})
  const items=rows.map(({driverId,vehicle,...r})=>({...r,role:vehicle.provider.ownerId===user.id?'OWNER':'DRIVER',vehicle:{id:vehicle.id,label:vehicle.label,vehicleClass:vehicle.vehicleClass,state:vehicle.state,providerName:vehicle.provider.displayName},isExpired:r.state==='INVITED'&&r.expiresAt<=new Date()}))
  return jsonOk({items,dispatchEnabled:false,certificationEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'driver-invitation-accept',8,60000)
  let inviteHash
  try{inviteHash=parseDriverAcceptance(await readJson(req))}catch{throw errors.badRequest('Enter the invitation code and confirm consent.')}
  try{return await db.$transaction(async tx=>{
   const driver=await tx.user.findUnique({where:{id:user.id},select:{status:true,deletedAt:true,emailVerifiedAt:true}})
   if(driver?.status!=='ACTIVE'||driver.deletedAt||!driver.emailVerifiedAt)throw errors.forbidden('Active verified account required.')
   const row=await tx.transportDriverAssignment.findUnique({where:{inviteHash},include:{vehicle:{include:{provider:{include:{owner:{select:{status:true,deletedAt:true,emailVerifiedAt:true}}}}}}}})
   const now=new Date()
   if(!row||!mayAcceptDriverInvitation(row,now)||row.vehicle.state!=='DRAFT')throw errors.notFound('Invitation unavailable or expired.')
   const p=row.vehicle.provider
   if(!['PENDING','APPROVED'].includes(p.reviewStatus)||p.owner.status!=='ACTIVE'||p.owner.deletedAt||!p.owner.emailVerifiedAt)throw errors.notFound('Invitation unavailable or expired.')
   if(await tx.userBlock.findFirst({where:{OR:[{blockerId:user.id,blockedId:p.ownerId},{blockerId:p.ownerId,blockedId:user.id}]}}))throw errors.notFound('Invitation unavailable.')
   if(await tx.transportDriverAssignment.findFirst({where:{driverId:user.id,state:'ACCEPTED'}}))throw errors.conflict('End your current private vehicle assignment first.')
   const item=await tx.transportDriverAssignment.update({where:{id:row.id},data:{driverId:user.id,state:'ACCEPTED',acceptedAt:now},select:{id:true,state:true}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'invited-driver',action:'transport-driver.accept',entityType:'TransportVehicle',entityId:row.vehicleId,after:JSON.stringify({assignmentId:item.id})}})
   return jsonOk({item,certificationEnabled:false,dispatchEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Assignment changed; refresh and retry.');throw e}
 })
}
