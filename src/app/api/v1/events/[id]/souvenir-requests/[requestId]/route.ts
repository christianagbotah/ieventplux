import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {canViewProgramme} from '@/server/event-operations-access'
import {orgCan} from '@/server/permissions'
import {parseRequestDecision,decisionAllowed} from '@/server/marketplace-request-policy'
type Context={params:Promise<{id:string;requestId:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'souvenir-decision',30,60000)
  const {id,requestId}=await ctx.params
  const {member}=await canViewProgramme(id)
  let next
  try{next=parseRequestDecision(await readJson(req))}catch{throw errors.badRequest('Invalid request decision.')}
  return db.$transaction(async tx=>{
   const row=await tx.eventSouvenirRequest.findFirst({where:{id:requestId,product:{eventId:id}}})
   if(!row)throw errors.notFound('Request not found.')
   const role=member&&orgCan(member.role,'tickets:manage')?'seller':row.buyerId===user.id?'buyer':null
   if(!role)throw errors.notFound('Request not found.')
   if(!decisionAllowed(role,row.status,next))throw errors.conflict('This decision is not available.')
   if(row.status!==next){
    const changed=await tx.eventSouvenirRequest.updateMany({where:{id:row.id,status:row.status},data:{status:next}})
    if(changed.count!==1)throw errors.conflict('Request changed. Refresh and try again.')
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'souvenir-'+role,action:'souvenir.request.decision',entityType:'EventSouvenirRequest',entityId:row.id,before:JSON.stringify({status:row.status}),after:JSON.stringify({status:next})}})
   }
   return jsonOk({status:next,paymentEnabled:false,inventoryReserved:false})
  })
 })
}
