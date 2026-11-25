import {NextRequest} from 'next/server'
import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,rateLimit,errors} from '@/server/api'
import {newDocumentId,prepareKycFile,saveEncryptedKyc,deleteKycFile} from '@/server/kyc-storage'
import {credentialProjection,providerDocumentNamespace,requireProviderIntake} from '@/server/provider-credential-intake'
import {parseDocumentKind,providerIntakeEnabled,MAX_PROVIDER_DOCUMENTS} from '@/server/provider-credential-intake-policy'
type Context={params:Promise<{id:string}>}
export const dynamic='force-dynamic'
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  const p=await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},select:{credentialDocuments:{select:credentialProjection,orderBy:{uploadedAt:'desc'},take:MAX_PROVIDER_DOCUMENTS}}})
  if(!p)throw errors.notFound('Provider unavailable.')
  return jsonOk({items:p.credentialDocuments,intakeEnabled:providerIntakeEnabled(process.env),certificationEnabled:false},{headers:{'Cache-Control':'private, no-store'}})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser(),{id}=await ctx.params
  requireProviderIntake()
  await rateLimit(req,'provider-credential-upload',6,60000)
  const p=await db.serviceProviderProfile.findFirst({where:{id,ownerId:user.id},include:{owner:{select:{status:true,emailVerifiedAt:true,deletedAt:true}}}})
  if(!p)throw errors.notFound('Provider unavailable.')
  if(p.owner.status!=='ACTIVE'||!p.owner.emailVerifiedAt||p.owner.deletedAt||p.reviewStatus!=='PENDING')throw errors.forbidden('Active pending provider account required.')
  const form=await req.formData().catch(()=>null)
  if(!form)throw errors.badRequest('Multipart upload required.')
  let kind
  try{kind=parseDocumentKind(p.category,form.get('kind'),form.get('consent'))}catch{throw errors.badRequest('Choose an applicable document and consent.')}
  const file=form.get('file')
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type))throw errors.badRequest('Upload a clear image, not a PDF.')
  const safe=await prepareKycFile(file,'GOVERNMENT_ID')
  if(safe.mime!=='image/webp'||safe.buffer.length>8388608)throw errors.badRequest('Unsupported image.')
  const docId=newDocumentId(),namespace=providerDocumentNamespace(id)
  await saveEncryptedKyc(namespace,docId,safe.buffer)
  try{
   const item=await db.$transaction(async tx=>{
    const current=await tx.serviceProviderProfile.findFirst({where:{id,ownerId:user.id,reviewStatus:'PENDING',owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}}},select:{category:true}})
    if(!current||current.category!==p.category)throw errors.conflict('Provider changed.')
    if(await tx.providerCredentialDocument.count({where:{providerId:id}})>=MAX_PROVIDER_DOCUMENTS)throw errors.conflict('Document limit reached.')
    const doc=await tx.providerCredentialDocument.create({data:{id:docId,providerId:id,kind,mime:safe.mime,size:safe.buffer.length},select:credentialProjection})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'provider-owner',action:'provider-credential.upload',entityType:'ServiceProviderProfile',entityId:id,after:JSON.stringify({documentId:doc.id,kind})}})
    return doc
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
   return jsonOk({item,certificationEnabled:false},{status:201,headers:{'Cache-Control':'private, no-store'}})
  }catch(e){
   // If the commit outcome is unknown, preserve bytes rather than delete a referenced document.
   const existing=await db.providerCredentialDocument.findUnique({where:{id:docId},select:{id:true}})
   if(!existing)await deleteKycFile(namespace,docId)
   if(e&&typeof e==='object'&&'code'in e&&e.code==='P2034')throw errors.conflict('Provider changed; refresh and retry.')
   throw e
  }
 })
}
