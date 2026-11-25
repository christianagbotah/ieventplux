import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,rateLimit,readJson,errors} from '@/server/api'
import {credentialProjection} from '@/server/provider-credential-intake'
import {screeningDecision} from '@/server/provider-credential-intake-policy'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  await requirePlatformRole('admin:settings')
  const actor=await requireElevated(),{id}=await ctx.params,raw=await readJson(req)
  await rateLimit(req,'provider-credential-screen',15,60000)
  try{return await db.$transaction(async tx=>{
   const reviewer=await tx.user.findUnique({where:{id:actor.id},select:{role:true,status:true,deletedAt:true}})
   if(reviewer?.role!=='SUPER_ADMIN'||reviewer.status!=='ACTIVE'||reviewer.deletedAt)throw errors.forbidden('Active super administrator required.')
   const doc=await tx.providerCredentialDocument.findUnique({where:{id},include:{provider:{select:{ownerId:true}}}})
   if(!doc||doc.provider.ownerId===actor.id)throw errors.notFound('Document unavailable.')
   let reviewStatus
   try{reviewStatus=screeningDecision(raw,doc.provider.ownerId,actor.id,doc.reviewStatus)}catch{throw errors.badRequest('Independent document screening required.')}
   const item=await tx.providerCredentialDocument.update({where:{id},data:{reviewStatus,reviewerId:actor.id,reviewedAt:new Date()},select:credentialProjection})
   await tx.auditLog.create({data:{actorUserId:actor.id,actorLabel:'credential-reviewer',action:'provider-credential.screen',entityType:'ServiceProviderProfile',entityId:doc.providerId,after:JSON.stringify({documentId:id,reviewStatus})}})
   return jsonOk({item,certificationEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Document changed; refresh and retry.');throw e}
 })
}
