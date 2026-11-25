import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,rateLimit,readJson,errors} from '@/server/api'
import {parseServiceArea} from '@/server/service-area-catalogue-policy'
export async function POST(req:NextRequest){
 return handle(async()=>{
  await requirePlatformRole('admin:settings')
  const actor=await requireElevated()
  await rateLimit(req,'service-area-admin',15,60000)
  let input
  try{input=parseServiceArea(await readJson(req))}catch{throw errors.badRequest('Enter a reviewed public community centroid, not a private address.')}
  try{return await db.$transaction(async tx=>{
   const admin=await tx.user.findUnique({where:{id:actor.id},select:{role:true,status:true,deletedAt:true}})
   if(admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE'||admin.deletedAt)throw errors.forbidden('Active super administrator required.')
   const duplicate=await tx.serviceArea.findFirst({where:{country:input.country,region:input.region,name:{equals:input.name,mode:'insensitive'}}})
   if(duplicate)throw errors.conflict('Community already exists.')
   const item=await tx.serviceArea.create({data:{...input,createdBy:actor.id},select:{id:true,name:true,region:true,country:true}})
   await tx.auditLog.create({data:{actorUserId:actor.id,actorLabel:'service-area-reviewer',action:'service-area.create',entityType:'ServiceArea',entityId:item.id,after:JSON.stringify(item)}})
   return jsonOk({item},{status:201})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code'in e&&['P2002','P2034'].includes(String(e.code)))throw errors.conflict('Community changed; refresh and retry.');throw e}
 })
}
