import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,readJson,rateLimit,errors} from '@/server/api'
import {ownerProviderAction} from '@/server/service-provider-lifecycle'
type Context={params:Promise<{id:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'provider-availability',30,60000)
  const {id}=await ctx.params
  const raw=await readJson(req)
  try{return await db.$transaction(async tx=>{
   const p=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},include:{owner:{select:{status:true,emailVerifiedAt:true,deletedAt:true}}}})
   if(!p)throw errors.notFound('Provider not found.')
   if(p.owner.status!=='ACTIVE'||!p.owner.emailVerifiedAt||p.owner.deletedAt)throw errors.forbidden('Active verified account required.')
   let data
   try{data=ownerProviderAction(p,raw,new Date())}catch(e){throw errors.badRequest(e instanceof Error?e.message:'Action unavailable.')}
   const updated=await tx.serviceProviderProfile.update({where:{id},data,select:{id:true,published:true,availabilityState:true,availableUntil:true,lastConfirmedAt:true}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'service-provider',action:'service-provider.state',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify(updated)}})
   return jsonOk({item:updated,dispatchEnabled:false})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Provider changed; refresh and retry.');throw e}
 })
}
