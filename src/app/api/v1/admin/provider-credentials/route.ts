import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,errors} from '@/server/api'
import {credentialProjection} from '@/server/provider-credential-intake'
export const dynamic='force-dynamic'
export async function GET(){
 return handle(async()=>{
  await requirePlatformRole('admin:settings')
  const actor=await requireElevated()
  const reviewer=await db.user.findUnique({where:{id:actor.id},select:{role:true,status:true,deletedAt:true}})
  if(reviewer?.role!=='SUPER_ADMIN'||reviewer.status!=='ACTIVE'||reviewer.deletedAt)throw errors.forbidden('Active super administrator required.')
  const items=await db.providerCredentialDocument.findMany({where:{reviewStatus:'PENDING',provider:{ownerId:{not:actor.id}}},orderBy:{uploadedAt:'asc'},take:100,select:{...credentialProjection,provider:{select:{id:true,category:true,displayName:true,community:true}}}})
  return jsonOk({items,certificationEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
