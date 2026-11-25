import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {appointmentDecision} from '@/server/service-appointment-policy'
import {appointmentEnquiryInclude,requireAppointmentEligibility} from '@/server/service-appointment-access'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'service-appointment-decision',30,60000)
  const {id}=await ctx.params,raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const row=await tx.serviceAppointment.findFirst({where:{id,enquiry:{OR:[{customerId:user.id},{provider:{ownerId:user.id}}]}},include:{enquiry:{include:appointmentEnquiryInclude}}})
   if(!row)throw errors.notFound('Appointment unavailable.')
   const q=row.enquiry,role=q.customerId===user.id?'CUSTOMER':'PROVIDER',actor=role==='CUSTOMER'?q.customer:q.provider.owner
   if(actor.status!=='ACTIVE'||actor.deletedAt||!actor.emailVerifiedAt)throw errors.forbidden('Active verified account required.')
   const now=new Date()
   let status
   try{status=appointmentDecision(role,row,raw,now)}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Decision unavailable.')}
   if(status==='CONFIRMED'){
    await requireAppointmentEligibility(tx,q,now)
    const overlap=await tx.serviceAppointment.findFirst({where:{id:{not:id},status:'CONFIRMED',startsAt:{lt:row.endsAt},endsAt:{gt:row.startsAt},enquiry:{OR:[{provider:{ownerId:{in:[q.provider.ownerId,q.customerId]}}},{customerId:{in:[q.provider.ownerId,q.customerId]}}}]}}})
    if(overlap)throw errors.conflict('The provider or customer already has an overlapping appointment.')
   }
   const item=await tx.serviceAppointment.update({where:{id},data:{status},select:{id:true,status:true,startsAt:true,endsAt:true}})
   const recipient=role==='CUSTOMER'?q.provider.owner:q.customer
   const blocked=await tx.userBlock.findFirst({where:{OR:[{blockerId:q.customerId,blockedId:q.provider.ownerId},{blockerId:q.provider.ownerId,blockedId:q.customerId}]}})
   if(!blocked&&recipient.status==='ACTIVE'&&!recipient.deletedAt)await tx.notification.create({data:{userId:role==='CUSTOMER'?q.provider.ownerId:q.customerId,type:'SERVICE_APPOINTMENT_UPDATE',title:'Appointment updated',body:'Review the latest appointment decision.',link:'/services/enquiries'}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:role,action:'service-appointment.decision',entityType:'ServiceAppointment',entityId:id,before:JSON.stringify({status:row.status}),after:JSON.stringify(item)}})
   return jsonOk({item,paymentEnabled:false,dispatchEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Appointment changed; refresh and retry.');throw e}
 })
}
