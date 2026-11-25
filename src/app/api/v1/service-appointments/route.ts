import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {parseAppointment} from '@/server/service-appointment-policy'
import {appointmentEnquiryInclude,requireAppointmentEligibility} from '@/server/service-appointment-access'
export const dynamic='force-dynamic'
export async function GET(){
 return handle(async()=>{
  const user=await requireUser()
  const rows=await db.serviceAppointment.findMany({where:{enquiry:{OR:[{customerId:user.id},{provider:{ownerId:user.id}}]}},select:{id:true,enquiryId:true,startsAt:true,endsAt:true,status:true,enquiry:{select:{customerId:true,provider:{select:{displayName:true,category:true}},customer:{select:{displayName:true}}}}},orderBy:{startsAt:'asc'},take:100})
  return jsonOk({items:rows.map(({enquiry,...r})=>({...r,role:enquiry.customerId===user.id?'CUSTOMER':'PROVIDER',provider:enquiry.provider,customer:enquiry.customer})),paymentEnabled:false,dispatchEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'service-appointment-create',10,60000)
  let input
  try{input=parseAppointment(await readJson(req),new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid appointment.')}
  try{return await db.$transaction(async tx=>{
   const row=await tx.serviceEnquiry.findFirst({where:{id:input.enquiryId,customerId:user.id},include:appointmentEnquiryInclude})
   if(!row)throw errors.notFound('Enquiry unavailable.')
   const prior=await tx.serviceAppointment.findUnique({where:{enquiryId:row.id}})
   if(prior){
    if(prior.startsAt.getTime()!==input.startsAt.getTime()||prior.endsAt.getTime()!==input.endsAt.getTime())throw errors.conflict('An appointment already exists for this enquiry.')
    return jsonOk({item:prior,replayed:true,paymentEnabled:false,dispatchEnabled:false})
   }
   await requireAppointmentEligibility(tx,row,new Date())
   const item=await tx.serviceAppointment.create({data:input})
   await tx.notification.create({data:{userId:row.provider.ownerId,type:'SERVICE_APPOINTMENT',title:'New appointment request',body:'Review the proposed time in your service workspace.',link:'/services/enquiries'}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-customer',action:'service-appointment.request',entityType:'ServiceAppointment',entityId:item.id,after:JSON.stringify({status:item.status,startsAt:item.startsAt,endsAt:item.endsAt})}})
   return jsonOk({item,paymentEnabled:false,dispatchEnabled:false},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Appointment changed; refresh and retry.');throw e}
 })
}
