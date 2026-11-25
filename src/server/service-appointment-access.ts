import {Prisma} from '@prisma/client'
import {SERVICE_CATEGORIES} from '@/server/service-directory-policy'
import {eligibleProvider} from '@/server/service-provider-lifecycle'
import {errors} from '@/server/api'
export const appointmentEnquiryInclude={customer:{select:{status:true,deletedAt:true,emailVerifiedAt:true}},provider:{include:{owner:{select:{status:true,deletedAt:true,emailVerifiedAt:true}}}}} as const
type Enquiry=Prisma.ServiceEnquiryGetPayload<{include:typeof appointmentEnquiryInclude}>
export async function requireAppointmentEligibility(tx:Prisma.TransactionClient,row:Enquiry,now:Date){
 const p=row.provider
 if(row.status!=='QUOTE_ACCEPTED'||!row.quoteExpiresAt||row.quoteExpiresAt<=now||!p.published||!eligibleProvider(p,now)||!SERVICE_CATEGORIES.some(c=>c.id===p.category&&!c.regulated)||p.owner.status!=='ACTIVE'||p.owner.deletedAt||!p.owner.emailVerifiedAt||row.customer.status!=='ACTIVE'||row.customer.deletedAt||!row.customer.emailVerifiedAt)throw errors.conflict('Accepted current quotation and eligible participants required.')
 if(await tx.userBlock.findFirst({where:{OR:[{blockerId:row.customerId,blockedId:p.ownerId},{blockerId:p.ownerId,blockedId:row.customerId}]}}))throw errors.conflict('Appointment unavailable.')
}
