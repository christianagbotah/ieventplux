import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {canViewProgramme} from '@/server/event-operations-access'
import {orgCan} from '@/server/permissions'
import {parseSouvenirRequest,quoteSouvenir} from '@/server/souvenir-request-policy'
type Context={params:Promise<{id:string}>}
const fields={id:true,productId:true,quantity:true,unitPriceMinor:true,totalMinor:true,currency:true,productName:true,productSku:true,status:true,createdAt:true} as const
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  const {event,member}=await canViewProgramme((await ctx.params).id)
  const manager=!!member&&orgCan(member.role,'tickets:manage')
  const items=await db.eventSouvenirRequest.findMany({where:{product:{eventId:event.id},...(manager?{}:{buyerId:user.id})},select:fields,orderBy:{createdAt:'desc'},take:50})
  return jsonOk({items,manager,paymentEnabled:false,inventoryReserved:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'souvenir-purchase-request',15,60000)
  const {event,member}=await canViewProgramme((await ctx.params).id)
  if(member)throw errors.forbidden('Organizer staff cannot request merchandise from their own event.')
  let input
  try{input=parseSouvenirRequest(await readJson(req))}catch{throw errors.badRequest('Review product, price and quantity.')}
  try{
   return await db.$transaction(async tx=>{
    const product=await tx.eventSouvenirProduct.findUnique({where:{id:input.productId},include:{event:{select:{id:true,status:true,deletedAt:true,orgId:true,visibility:true}}}})
    if(!product||product.eventId!==event.id||product.event.deletedAt)throw errors.notFound('Product unavailable.')
    if(product.event.visibility==='INVITE_ONLY'){
     const [rsvp,ticket]=await Promise.all([tx.rsvp.findFirst({where:{eventId:event.id,userId:user.id,status:'APPROVED'}}),tx.ticket.findFirst({where:{eventId:event.id,userId:user.id,status:{in:['VALID','CHECKED_IN']}}})])
     if(!rsvp&&!ticket)throw errors.forbidden('Invitation required.')
    }
    const key={productId:product.id,buyerId:user.id,requestKey:input.requestKey}
    const prior=await tx.eventSouvenirRequest.findUnique({where:{productId_buyerId_requestKey:key},select:fields})
    if(prior){
     if(prior.quantity!==input.quantity||prior.unitPriceMinor!==input.expectedUnitPriceMinor)throw errors.conflict('Request key already used with different selection.')
     return jsonOk({request:prior,replayed:true,paymentEnabled:false,inventoryReserved:false})
    }
    if(!['PUBLISHED','LIVE','POSTPONED'].includes(product.event.status))throw errors.conflict('Event is not accepting merchandise requests.')
    let quote
    try{quote=quoteSouvenir(input,product)}catch{throw errors.conflict('Price or availability changed. Review again.')}
    const request=await tx.eventSouvenirRequest.create({data:{...key,...quote,productName:product.name,productSku:product.sku},select:fields})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'souvenir-buyer',action:'souvenir.request.create',entityType:'EventSouvenirRequest',entityId:request.id,after:JSON.stringify({eventId:event.id,totalMinor:quote.totalMinor})}})
    return jsonOk({request,replayed:false,paymentEnabled:false,inventoryReserved:false},{status:201})
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  }catch(e){if(e&&typeof e==='object'&&'code' in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Request conflicted. Retry with the same request key.');throw e}
 })
}
