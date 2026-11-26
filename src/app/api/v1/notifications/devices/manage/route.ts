import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {ApiError,errors,handle,jsonOk,rateLimit,readJson,requireSession} from '@/server/api'
import {deviceManagementId,publicPushDevice,validManagementId} from '@/server/push-device-management'
const headers={'Cache-Control':'private, no-store'}
const select={keyHash:true,activatedAt:true,platform:true,updatedAt:true,leaseUntil:true,sessionId:true} as const
const scope=(userId:string,now:Date)=>({revokedAt:null,session:{userId,revokedAt:null,expiresAt:{gt:now}}})
export async function GET(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'push-account-devices',60,60000)
  const {user,sessionId}=await requireSession()
  if(req.nextUrl.searchParams.get('expectedUserId')!==user.id)throw errors.conflict('The signed-in account changed.')
  const now=new Date()
  const rows=await db.pushInstallation.findMany({where:scope(user.id,now),select,orderBy:[{updatedAt:'desc'},{keyHash:'asc'}],take:51})
  return jsonOk({accountEnabled:user.notifPrefs.push===true,deliveryEnabled:false,items:rows.slice(0,50).map(row=>publicPushDevice(row,sessionId,now)),hasMore:rows.length>50},{headers})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'push-account-device-revoke',20,60000)
  const {user,sessionId}=await requireSession()
  const body=await readJson<{expectedUserId?:string;id?:string}>(req)
  if(body?.expectedUserId!==user.id)throw errors.conflict('The signed-in account changed.')
  if(!validManagementId(body?.id))throw errors.badRequest('Invalid device selection.')
  try{
   await db.$transaction(async tx=>{
    const now=new Date()
    const active=await tx.session.findFirst({where:{id:sessionId,userId:user.id,revokedAt:null,expiresAt:{gt:now},user:{status:'ACTIVE',deletedAt:null}},select:{id:true}})
    if(!active)throw errors.unauthorized()
    const rows=await tx.pushInstallation.findMany({where:scope(user.id,now),select,orderBy:[{updatedAt:'desc'},{keyHash:'asc'}],take:50})
    const row=rows.find(row=>deviceManagementId(row.keyHash,row.activatedAt)===body.id)
    if(row)await tx.pushInstallation.updateMany({where:{...scope(user.id,now),keyHash:row.keyHash,sessionId:row.sessionId,activatedAt:row.activatedAt},data:{revokedAt:now,leaseUntil:null}})
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  }catch(err){
   if(err instanceof ApiError)throw err
   if(err&&typeof err==='object'&&'code' in err&&err.code==='P2034')throw errors.conflict('Device state changed. Refresh and retry.')
   throw errors.unavailable('DEVICE_MANAGEMENT_UNAVAILABLE','Device management is temporarily unavailable.')
  }
  // Same response for an already revoked, foreign or stale generation.
  return jsonOk({ok:true},{headers})
 })
}
