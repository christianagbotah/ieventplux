import type {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from './api'
import {orgCan} from './permissions'
import {canReadCommunity} from './community-policy'

/** Shared server-owned audience entitlement, usable inside mutation transactions. */
export async function engagementAccess(eventId:string,userId:string|null,client:Prisma.TransactionClient=db){
 const event=await client.event.findUnique({where:{id:eventId},select:{id:true,orgId:true,status:true,visibility:true,deletedAt:true,org:{select:{status:true,deletedAt:true}}}})
 if(!event||event.deletedAt||event.org.deletedAt||event.org.status!=='ACTIVE')throw errors.notFound('Event engagement unavailable.')
 const member=userId?await client.membership.findFirst({where:{orgId:event.orgId,userId,acceptedAt:{not:null}},select:{role:true}}):null
 const organizer=!!member&&orgCan(member.role,'event:edit')
 let approvedRsvp=false,validTicket=false
 if(event.visibility==='INVITE_ONLY'&&userId&&!member){
  const [rsvp,ticket]=await Promise.all([client.rsvp.findFirst({where:{eventId,userId,status:'APPROVED'},select:{id:true}}),client.ticket.findFirst({where:{eventId,userId,status:{in:['VALID','CHECKED_IN']}},select:{id:true}})])
  approvedRsvp=!!rsvp;validTicket=!!ticket
 }
 if(!canReadCommunity(event,{organizer:!!member,approvedRsvp,validTicket}))throw errors.notFound('Event engagement unavailable.')
 return {event,organizer}
}
