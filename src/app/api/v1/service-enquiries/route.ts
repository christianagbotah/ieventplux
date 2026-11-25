import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {parseEnquiry} from '@/server/service-enquiry-policy'
import {SERVICE_CATEGORIES} from '@/server/service-directory-policy'
import {eligibleProvider} from '@/server/service-provider-lifecycle'
export const dynamic='force-dynamic'
const select={id:true,providerId:true,customerId:true,description:true,community:true,status:true,quoteMinor:true,quoteNote:true,quoteExpiresAt:true,createdAt:true,provider:{select:{displayName:true,category:true}},customer:{select:{displayName:true}}} as const
export async function GET(){
 return handle(async()=>{
  const user=await requireUser()
  const rows=await db.serviceEnquiry.findMany({where:{OR:[{customerId:user.id},{provider:{ownerId:user.id}}]},select,orderBy:[{createdAt:'desc'},{id:'desc'}],take:100})
  const items=rows.map(({customerId,...row})=>({...row,role:customerId===user.id?'CUSTOMER':'PROVIDER'}))
  return jsonOk({items,bookingEnabled:false,paymentEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'service-enquiry-create',10,60000)
  let input
  try{input=parseEnquiry(await readJson(req))}catch{throw errors.badRequest('Enter a service description and community.')}
  try{return await db.$transaction(async tx=>{
   const customer=await tx.user.findUnique({where:{id:user.id},select:{status:true,deletedAt:true,emailVerifiedAt:true}})
   if(customer?.status!=='ACTIVE'||customer.deletedAt||!customer.emailVerifiedAt)throw errors.forbidden('Active verified account required.')
   const p=await tx.serviceProviderProfile.findUnique({where:{id:input.providerId},include:{owner:{select:{status:true,deletedAt:true,emailVerifiedAt:true}}}})
   if(!p||p.ownerId===user.id||!p.published||!eligibleProvider(p,new Date())||!SERVICE_CATEGORIES.some(c=>c.id===p.category&&!c.regulated)||p.owner.status!=='ACTIVE'||p.owner.deletedAt||!p.owner.emailVerifiedAt)throw errors.notFound('Provider unavailable.')
   const blocked=await tx.userBlock.findFirst({where:{OR:[{blockerId:user.id,blockedId:p.ownerId},{blockerId:p.ownerId,blockedId:user.id}]}})
   if(blocked)throw errors.notFound('Provider unavailable.')
   const key={providerId:p.id,customerId:user.id,requestKey:input.requestKey}
   const prior=await tx.serviceEnquiry.findUnique({where:{providerId_customerId_requestKey:key},select:{id:true,description:true,community:true,status:true}})
   if(prior){
    if(prior.description!==input.description||prior.community!==input.community)throw errors.conflict('Request key already used for different details.')
    return jsonOk({id:prior.id,status:prior.status,replayed:true,bookingEnabled:false,paymentEnabled:false})
   }
   const existing=await tx.serviceEnquiry.count({where:{customerId:user.id,providerId:p.id,status:{in:['REQUESTED','QUOTED']}}})
   if(existing>=3)throw errors.conflict('Too many open enquiries with this provider.')
   const row=await tx.serviceEnquiry.create({data:{...key,description:input.description,community:input.community},select:{id:true,status:true}})
   await tx.notification.create({data:{userId:p.ownerId,type:'SERVICE_ENQUIRY',title:'New service enquiry',body:'A customer has requested a quotation. Review it in your service workspace.',link:'/services/enquiries'}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-customer',action:'service-enquiry.create',entityType:'ServiceEnquiry',entityId:row.id,after:JSON.stringify({status:row.status})}})
   return jsonOk({...row,replayed:false,bookingEnabled:false,paymentEnabled:false},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Enquiry changed; retry using the same request key.');throw e}
 })
}
