import {NextRequest,NextResponse} from 'next/server'
import {Prisma} from '@prisma/client'
import {unlink} from 'node:fs/promises'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,requirePlatformRole,requireElevated,rateLimit,errors} from '@/server/api'
import {readEncryptedKyc,privateDocumentPath} from '@/server/kyc-storage'
import {providerDocumentNamespace} from '@/server/provider-credential-intake'
type Context={params:Promise<{id:string;documentId:string}>}
export const dynamic='force-dynamic'
export async function GET(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,documentId}=await ctx.params
  await rateLimit(req,'provider-credential-view',30,60000)
  const row=await db.providerCredentialDocument.findFirst({where:{id:documentId,providerId:id},include:{provider:{select:{ownerId:true}}}})
  if(!row)throw errors.notFound('Document unavailable.')
  if(row.provider.ownerId!==user.id){
   await requirePlatformRole('admin:settings')
   await requireElevated()
   const reviewer=await db.user.findUnique({where:{id:user.id},select:{role:true,status:true,deletedAt:true}})
   if(reviewer?.role!=='SUPER_ADMIN'||reviewer.status!=='ACTIVE'||reviewer.deletedAt)throw errors.notFound('Document unavailable.')
  }
  const account=await db.user.findUnique({where:{id:user.id},select:{status:true,deletedAt:true}})
  if(account?.status!=='ACTIVE'||account.deletedAt)throw errors.forbidden('Active account required.')
  let bytes
  try{bytes=await readEncryptedKyc(providerDocumentNamespace(id),documentId)}catch{throw errors.notFound('Document unavailable.')}
  await db.auditLog.create({data:{actorUserId:user.id,actorLabel:'credential-viewer',action:'provider-credential.view',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({documentId})}})
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Content-Disposition':'inline; filename="provider-credential.webp"','Cache-Control':'private, no-store, no-cache, must-revalidate','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}})
 })
}
export async function DELETE(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id,documentId}=await ctx.params
  await rateLimit(req,'provider-credential-delete',10,60000)
  await db.$transaction(async tx=>{
   const row=await tx.providerCredentialDocument.findFirst({where:{id:documentId,providerId:id,provider:{ownerId:user.id}}})
   if(!row)throw errors.notFound('Document unavailable.')
   if(row.reviewStatus!=='PENDING')throw errors.conflict('Reviewed records require a privacy support request.')
   await tx.providerCredentialDocument.delete({where:{id:documentId}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'provider-owner',action:'provider-credential.withdraw',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({documentId})}})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  // Remove active bytes only after authorization and committed metadata deletion.
  try{await unlink(privateDocumentPath(providerDocumentNamespace(id),documentId))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw errors.unavailable('CREDENTIAL_CLEANUP_REQUIRED','Document access revoked; storage cleanup requires operator review.')}
  return jsonOk({removed:true},{headers:{'Cache-Control':'private, no-store'}})
 })
}
