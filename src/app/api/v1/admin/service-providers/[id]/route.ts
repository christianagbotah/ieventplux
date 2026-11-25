import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,readJson,rateLimit,errors} from '@/server/api'
import {reviewProvider} from '@/server/service-provider-lifecycle'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  await requirePlatformRole('admin:settings')
  const actor=await requireElevated()
  await rateLimit(req,'provider-review',15,60000)
  const {id}=await ctx.params
  const raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findUnique({where:{id},include:{owner:{select:{status:true,emailVerifiedAt:true,deletedAt:true}}}})
   if(!p)throw errors.notFound('Provider not found.')
   if(p.ownerId===actor.id)throw errors.forbidden('Independent reviewer required.')
   const reviewer=await tx.user.findUnique({where:{id:actor.id},select:{status:true,role:true,deletedAt:true}})
   if(reviewer?.status!=='ACTIVE'||reviewer.role!=='SUPER_ADMIN'||reviewer.deletedAt)throw errors.forbidden('Active administrator required.')
   let data
   try{data=reviewProvider(p,raw)}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Review unavailable.')}
   if(data.reviewStatus==='APPROVED'&&(p.owner.status!=='ACTIVE'||!p.owner.emailVerifiedAt||p.owner.deletedAt))throw errors.conflict('Provider account is not eligible.')
   const updated=await tx.serviceProviderProfile.update({where:{id},data,select:{id:true,reviewStatus:true,published:true}})
   await tx.auditLog.create({data:{actorUserId:actor.id,actorLabel:'provider-reviewer',action:'service-provider.review',entityType:'ServiceProviderProfile',entityId:id,before:JSON.stringify({reviewStatus:p.reviewStatus}),after:JSON.stringify({...updated,reason:(raw as {reason:string}).reason.trim()})}})
   return jsonOk({item:updated,regulatedApprovalEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Provider changed; refresh and retry.');throw e}
 })
}
