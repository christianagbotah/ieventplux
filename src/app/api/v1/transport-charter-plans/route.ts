import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {parseCharterPlan,charterCapacityEstimate} from '@/server/transport-charter-policy'
export const dynamic='force-dynamic'
const select={id:true,title:true,originAreaId:true,destinationAreaId:true,departureAt:true,returnAt:true,passengers:true,state:true,origin:{select:{name:true,region:true}},destination:{select:{name:true,region:true}}} as const
export async function GET(){
 return handle(async()=>{
  const user=await requireUser()
  const rows=await db.transportCharterPlan.findMany({where:{customerId:user.id},select,orderBy:[{createdAt:'desc'},{id:'desc'}],take:100})
  return jsonOk({items:rows.map(r=>({...r,capacityEstimate:charterCapacityEstimate(r.passengers)})),bookingEnabled:false,paymentEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'transport-charter-plan',10,60000)
  let input
  try{input=parseCharterPlan(await readJson(req),new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid plan.')}
  try{return await db.$transaction(async tx=>{
   const account=await tx.user.findUnique({where:{id:user.id},select:{status:true,emailVerifiedAt:true,deletedAt:true}})
   if(account?.status!=='ACTIVE'||!account.emailVerifiedAt||account.deletedAt)throw errors.forbidden('Active verified account required.')
   const prior=await tx.transportCharterPlan.findUnique({where:{customerId_requestKey:{customerId:user.id,requestKey:input.requestKey}},select})
   if(prior){
    if(prior.title!==input.title||prior.originAreaId!==input.originAreaId||prior.destinationAreaId!==input.destinationAreaId||prior.departureAt.getTime()!==input.departureAt.getTime()||prior.returnAt?.getTime()!==input.returnAt?.getTime()||prior.passengers!==input.passengers)throw errors.conflict('Request key already used.')
    return jsonOk({item:prior,replayed:true,bookingEnabled:false,paymentEnabled:false})
   }
   const areas=await tx.serviceArea.findMany({where:{id:{in:[input.originAreaId,input.destinationAreaId]},country:'GH',active:true},select:{id:true}})
   if(areas.length!==new Set([input.originAreaId,input.destinationAreaId]).size)throw errors.notFound('Reviewed journey community unavailable.')
   if(await tx.transportCharterPlan.count({where:{customerId:user.id,state:'DRAFT'}})>=20)throw errors.conflict('Draft plan limit reached.')
   const item=await tx.transportCharterPlan.create({data:{customerId:user.id,...input},select})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'charter-planner',action:'transport-charter.create',entityType:'TransportCharterPlan',entityId:item.id,after:JSON.stringify({state:item.state,passengers:item.passengers})}})
   return jsonOk({item,bookingEnabled:false,paymentEnabled:false},{status:201,headers:{'Cache-Control':'private, no-store'}})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Plan changed; retry with the same request key.');throw e}
 })
}
