import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole} from '@/server/api'
export async function GET(){
 return handle(async()=>{
  await requirePlatformRole('admin:settings')
  const items=await db.serviceProviderProfile.findMany({where:{reviewStatus:{in:['PENDING','APPROVED']}},orderBy:{updatedAt:'desc'},take:100,select:{id:true,displayName:true,category:true,country:true,community:true,serviceDescription:true,reviewStatus:true,published:true,createdAt:true,owner:{select:{displayName:true,emailVerifiedAt:true,status:true}}}})
  return jsonOk({items,regulatedApprovalEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
