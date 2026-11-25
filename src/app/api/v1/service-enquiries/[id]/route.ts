import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {enquiryDecision} from '@/server/service-enquiry-policy'
import {eligibleProvider} from '@/server/service-provider-lifecycle'
import {SERVICE_CATEGORIES} from '@/server/service-directory-policy'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'service-enquiry-decision',30,60000)
  const {id}=await ctx.params,raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const row=await tx.serviceEnquiry.findFirst({where:{id,OR:[{customerId:user.id},{provider:{ownerId:user.id}}]},include:{customer:{select:{status:true,deletedAt:true,emailVerifiedAt:true}},provider:{include:{owner:{select:{status:true,deletedAt:true,emailVerifiedAt:true}}}}}})
   if(!row)throw errors.notFound('Enquiry not found.')
   const role=row.customerId===user.id?'CUSTOMER':'PROVIDER'
   const actor=role==='CUSTOMER'?row.customer:row.provider.owner
   if(actor.status!=='ACTIVE'||actor.deletedAt||!actor.emailVerifiedAt)throw errors.forbidden('Active verified account required.')
   let data
   try{data=enquiryDecision(role,row,raw,new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Decision unavailable.')}
   const createsCommitment=['QUOTED','QUOTE_ACCEPTED'].includes(data.status)
   if(createsCommitment){
    const p=row.provider
    if(!p.published||!eligibleProvider(p,new Date())||!SERVICE_CATEGORIES.some(c=>c.id===p.category&&!c.regulated)||p.owner.status!=='ACTIVE'||p.owner.deletedAt||!p.owner.emailVerifiedAt||row.customer.status!=='ACTIVE'||row.customer.deletedAt||!row.customer.emailVerifiedAt)throw errors.conflict('Provider or customer unavailable.')
    if(await tx.userBlock.findFirst({where:{OR:[{blockerId:row.customerId,blockedId:p.ownerId},{blockerId:p.ownerId,blockedId:row.customerId}]}}))throw errors.conflict('Enquiry unavailable.')
   }
   const updated=await tx.serviceEnquiry.update({where:{id},data,select:{id:true,status:true,quoteMinor:true,quoteExpiresAt:true}})
   // A blocked or inactive recipient must not receive new contact notifications.
   const recipient=role==='CUSTOMER'?row.provider.owner:row.customer
   const blocked=await tx.userBlock.findFirst({where:{OR:[{blockerId:row.customerId,blockedId:row.provider.ownerId},{blockerId:row.provider.ownerId,blockedId:row.customerId}]}})
   if(!blocked&&recipient.status==='ACTIVE'&&!recipient.deletedAt)await tx.notification.create({data:{userId:role==='CUSTOMER'?row.provider.ownerId:row.customerId,type:'SERVICE_ENQUIRY_UPDATE',title:'Service enquiry updated',body:'Review the latest enquiry status in your service workspace.',link:'/services/enquiries'}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:role,action:'service-enquiry.decision',entityType:'ServiceEnquiry',entityId:id,before:JSON.stringify({status:row.status}),after:JSON.stringify(updated)}})
   return jsonOk({item:updated,bookingEnabled:false,paymentEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Enquiry changed; refresh and retry.');throw e}
 })
}
