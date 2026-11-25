import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {parseServiceProviderEnrollment} from '@/server/service-provider-enrollment'
const fields={id:true,category:true,country:true,community:true,displayName:true,serviceDescription:true,reviewStatus:true,published:true,availabilityState:true,availableUntil:true,lastConfirmedAt:true,createdAt:true} as const
export async function GET(){
 return handle(async()=>{
  const user=await requireUser()
  const items=await db.serviceProviderProfile.findMany({where:{ownerId:user.id},select:fields,orderBy:{createdAt:'desc'},take:50})
  return jsonOk({items,pilotCountry:'GH',dispatchEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'service-provider-enrollment',8,60000)
  let input
  try{input=parseServiceProviderEnrollment(await readJson(req))}catch{throw errors.badRequest('Select a pilot service category and enter valid community and service details.')}
  try{
   const item=await db.$transaction(async tx=>{
    const account=await tx.user.findUnique({where:{id:user.id},select:{status:true,emailVerifiedAt:true,deletedAt:true}})
    if(!account?.emailVerifiedAt||account.status!=='ACTIVE'||account.deletedAt)throw errors.forbidden('Active verified email required.')
    const created=await tx.serviceProviderProfile.create({data:{...input,ownerId:user.id},select:fields})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-provider',action:'service-provider.enroll',entityType:'ServiceProviderProfile',entityId:created.id,after:JSON.stringify({category:created.category,country:created.country,reviewStatus:created.reviewStatus})}})
    return created
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
   return jsonOk({item,dispatchEnabled:false},{status:201})
  }catch(e){if(e&&typeof e==='object'&&'code' in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('An enrollment already exists or changed concurrently. Refresh your registrations.');throw e}
 })
}
