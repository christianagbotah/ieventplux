import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {vehicleClasses,parseVehicle} from '@/server/transport-fleet-policy'
type Context={params:Promise<{id:string}>}
export const dynamic='force-dynamic'
const projection={id:true,label:true,vehicleClass:true,passengerSeats:true,state:true,createdAt:true,stationArea:{select:{id:true,name:true,region:true,active:true}}} as const
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  const p=await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{category:true}})
  if(!p||!vehicleClasses(p.category).length)throw errors.notFound('Transport profile unavailable.')
  const items=await db.transportVehicle.findMany({where:{providerId:id},select:projection,orderBy:[{createdAt:'desc'},{id:'desc'}],take:100})
  return jsonOk({items,classes:vehicleClasses(p.category),certificationEnabled:false,dispatchEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'transport-fleet-create',10,60000)
  const raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id,owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}}},select:{category:true,country:true,reviewStatus:true}})
   if(!p||!vehicleClasses(p.category).length)throw errors.notFound('Transport profile unavailable.')
   if(p.reviewStatus!=='PENDING'&&p.reviewStatus!=='APPROVED')throw errors.conflict('Transport profile is not eligible for fleet registration.')
   let input
   try{input=parseVehicle(p.category,raw)}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid vehicle.')}
   if(input.stationAreaId&&!await tx.serviceArea.findFirst({where:{id:input.stationAreaId,country:p.country,active:true},select:{id:true}}))throw errors.notFound('Reviewed station community unavailable.')
   const prior=await tx.transportVehicle.findUnique({where:{providerId_labelKey:{providerId:id,labelKey:input.labelKey}},select:projection})
   if(prior){
    if(prior.state==='DRAFT'&&prior.vehicleClass===input.vehicleClass&&prior.passengerSeats===input.passengerSeats&&(prior.stationArea?.id||null)===input.stationAreaId)return jsonOk({item:prior,replayed:true,dispatchEnabled:false,certificationEnabled:false})
    throw errors.conflict('Fleet label already used.')
   }
   if(await tx.transportVehicle.count({where:{providerId:id}})>=100)throw errors.conflict('Pilot fleet limit reached.')
   const item=await tx.transportVehicle.create({data:{providerId:id,...input},select:projection})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-vehicle.register',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({vehicleId:item.id,vehicleClass:item.vehicleClass,passengerSeats:item.passengerSeats})}})
   return jsonOk({item,dispatchEnabled:false,certificationEnabled:false},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Fleet changed; refresh and retry.');throw e}
 })
}
