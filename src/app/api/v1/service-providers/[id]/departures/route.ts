import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {parseDeparture,planDeparture,departureInventoryScopes,DEPARTURE_INVENTORY_LIMIT} from '@/server/transport-departure-policy'
type Context={params:Promise<{id:string}>}
export const dynamic='force-dynamic'
const select={id:true,routeId:true,vehicleId:true,departureAt:true,arrivalAt:true,allocatedSeats:true,state:true,route:{select:{label:true}},vehicle:{select:{label:true,passengerSeats:true}}} as const
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  if(!await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{id:true}}))throw errors.notFound('Provider unavailable.')
  const scopes=departureInventoryScopes(id,new Date())
  const [upcoming,history]=await db.$transaction([
   db.transportDepartureDraft.findMany({where:scopes.upcoming,select,orderBy:[{departureAt:'asc'},{id:'asc'}],take:DEPARTURE_INVENTORY_LIMIT}),
   db.transportDepartureDraft.findMany({where:scopes.history,select,orderBy:[{departureAt:'desc'},{id:'desc'}],take:DEPARTURE_INVENTORY_LIMIT}),
  ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
  const items=[...upcoming,...history]
  return jsonOk({items,bookingEnabled:false,dispatchEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'transport-departure-create',10,60000)
  let input
  try{input=parseDeparture(await readJson(req),new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid departure.')}
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id,reviewStatus:{in:['PENDING','APPROVED']},owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}}},select:{id:true}})
   if(!p)throw errors.notFound('Provider unavailable.')
   const route=await tx.transportRouteDraft.findFirst({where:{id:input.routeId,providerId:id,origin:{active:true},destination:{active:true}}})
   const vehicle=await tx.transportVehicle.findFirst({where:{id:input.vehicleId,providerId:id}})
   if(!route||!vehicle)throw errors.notFound('Route or vehicle unavailable.')
   let slot
   try{slot=planDeparture(input,route,vehicle,new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Invalid allocation.')}
   const prior=await tx.transportDepartureDraft.findUnique({where:{routeId_vehicleId_departureAt:{routeId:route.id,vehicleId:vehicle.id,departureAt:slot.departureAt}},select})
   if(prior){
    if(prior.state==='DRAFT'&&prior.allocatedSeats===input.allocatedSeats)return jsonOk({item:prior,replayed:true,bookingEnabled:false})
    throw errors.conflict('Departure slot already used.')
   }
   if(await tx.transportDepartureDraft.findFirst({where:{vehicleId:vehicle.id,state:'DRAFT',departureAt:{lt:slot.arrivalAt},arrivalAt:{gt:slot.departureAt}},select:{id:true}}))throw errors.conflict('Vehicle already allocated during this journey.')
   if(await tx.transportDepartureDraft.count({where:{route:{providerId:id},state:'DRAFT',departureAt:{gte:new Date()}}})>=DEPARTURE_INVENTORY_LIMIT)throw errors.conflict('Pilot departure limit reached.')
   const item=await tx.transportDepartureDraft.create({data:{routeId:route.id,vehicleId:vehicle.id,...slot,allocatedSeats:input.allocatedSeats},select})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-departure.create',entityType:'TransportDepartureDraft',entityId:item.id,after:JSON.stringify({allocatedSeats:item.allocatedSeats,state:item.state})}})
   return jsonOk({item,bookingEnabled:false,dispatchEnabled:false},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Allocation changed; refresh and retry.');throw e}
 })
}
