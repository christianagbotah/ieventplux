import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,readJson,errors} from '@/server/api'
type Context={params:Promise<{id:string;routeId:string}>}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,routeId}=await ctx.params
  await rateLimit(req,'transport-route-archive',20,60000)
  const raw=await readJson(req)
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {action?:unknown}).action!=='ARCHIVE')throw errors.badRequest('Only archival is supported.')
  return db.$transaction(async tx=>{
   const where={id:routeId,providerId:id,provider:{ownerId:user.id,owner:{status:'ACTIVE' as const,deletedAt:null}}}
   if(!await tx.transportRouteDraft.findFirst({where,select:{id:true}}))throw errors.notFound('Route unavailable.')
   const result=await tx.transportRouteDraft.updateMany({where:{...where,state:'DRAFT'},data:{state:'ARCHIVED'}})
   if(result.count)await tx.transportDepartureDraft.updateMany({where:{routeId,state:'DRAFT'},data:{state:'CANCELLED'}})
   if(result.count)await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'transport-owner',action:'transport-route.archive',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({routeId})}})
   return jsonOk({id:routeId,state:'ARCHIVED',publicationEnabled:false})
  },{isolationLevel:'Serializable'})
 })
}
