import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {supportsRoutePlanning,parseTransportRoute} from '@/server/transport-route-policy'
type Context={params:Promise<{id:string}>}
export const dynamic='force-dynamic'
const select={id:true,label:true,originAreaId:true,destinationAreaId:true,departureMinute:true,operatingDays:true,estimatedMinutes:true,state:true,origin:{select:{name:true,region:true}},destination:{select:{name:true,region:true}}} as const
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  const p=await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{category:true}})
  if(!p||!supportsRoutePlanning(p.category))throw errors.notFound('Transport profile unavailable.')
  const items=await db.transportRouteDraft.findMany({where:{providerId:id},select,orderBy:{createdAt:'desc'},take:100})
  return jsonOk({items,publicationEnabled:false,bookingEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'transport-route-create',10,60000)
  const raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id,reviewStatus:{in:['PENDING','APPROVED']},owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}}},select:{category:true,country:true}})
   if(!p||!supportsRoutePlanning(p.category))throw errors.notFound('Transport profile unavailable.')
   let input
   try{input=parseTransportRoute(p.category,raw)}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid route.')}
   const areas=await tx.serviceArea.count({where:{id:{in:[input.originAreaId,input.destinationAreaId]},country:p.country,active:true}})
   if(areas!==2)throw errors.notFound('Reviewed route communities unavailable.')
   const prior=await tx.transportRouteDraft.findUnique({where:{providerId_labelKey:{providerId:id,labelKey:input.labelKey}},select})
   if(prior){
    if(prior.state==='DRAFT'&&prior.originAreaId===input.originAreaId&&prior.destinationAreaId===input.destinationAreaId&&prior.departureMinute===input.departureMinute&&prior.estimatedMinutes===input.estimatedMinutes&&JSON.stringify(prior.operatingDays)===JSON.stringify(input.operatingDays))return jsonOk({item:prior,replayed:true,publicationEnabled:false})
    throw errors.conflict('Route label already used.')
   }
   if(await tx.transportRouteDraft.count({where:{providerId:id}})>=100)throw errors.conflict('Pilot route limit reached.')
   const item=await tx.transportRouteDraft.create({data:{providerId:id,...input},select})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-route.create',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({routeId:item.id,state:item.state})}})
   return jsonOk({item,publicationEnabled:false,bookingEnabled:false},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Route changed; refresh and retry.');throw e}
 })
}
