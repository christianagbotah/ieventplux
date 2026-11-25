import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
import {parseAreaConsent} from '@/server/service-area-catalogue-policy'
type Context={params:Promise<{id:string}>}
export const dynamic='force-dynamic'
const projection={consentedAt:true,revokedAt:true,area:{select:{id:true,name:true,region:true,active:true}}} as const
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  const row=await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{areaConsent:{select:projection}}})
  if(!row)throw errors.notFound('Provider not found.')
  return jsonOk({consent:row.areaConsent},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'provider-area-consent',20,60000)
  let input
  try{input=parseAreaConsent(await readJson(req))}catch{throw errors.badRequest('Select a reviewed community and explicitly consent.')}
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},include:{owner:{select:{status:true,emailVerifiedAt:true,deletedAt:true}}}})
   if(!p)throw errors.notFound('Provider not found.')
   if(p.owner.status!=='ACTIVE'||!p.owner.emailVerifiedAt||p.owner.deletedAt)throw errors.forbidden('Active verified account required.')
   const area=await tx.serviceArea.findFirst({where:{id:input.areaId,country:p.country,active:true}})
   if(!area)throw errors.notFound('Community unavailable.')
   const now=new Date()
   const consent=await tx.providerServiceAreaConsent.upsert({where:{providerId:id},create:{providerId:id,areaId:area.id,consentedAt:now},update:{areaId:area.id,consentedAt:now,revokedAt:null},select:projection})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-provider',action:'service-area.consent',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({areaId:area.id})}})
   return jsonOk({consent})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Consent changed; refresh and retry.');throw e}
 })
}
export async function DELETE(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  await rateLimit(req,'provider-area-consent',20,60000)
  return db.$transaction(async tx=>{
   if(!await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{id:true}}))throw errors.notFound('Provider not found.')
   const updated=await tx.providerServiceAreaConsent.updateMany({where:{providerId:id,revokedAt:null},data:{revokedAt:new Date()}})
   if(updated.count)await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-provider',action:'service-area.revoke',entityType:'ServiceProviderProfile',entityId:id}})
   return jsonOk({revoked:true})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
 })
}
