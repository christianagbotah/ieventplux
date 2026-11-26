import { NextRequest } from 'next/server'
import { handle,jsonOk,requireUser,errors,rateLimit } from '@/server/api'
import { editableOrganizer } from '@/server/org-profile-access'
import { isSupportedImage,mediaFilePath,mediaStorageDirectory,MAX_UPLOAD_BYTES } from '@/server/media-storage'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { unlink,mkdir,writeFile } from 'node:fs/promises'
import sharp from 'sharp'

/** Public branding only. Fresh immutable URLs avoid old-logo cache problems. */
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'org-profile-image',12,60000)
  const {id}=await ctx.params
  const org=await db.organization.findFirst({where:{id,...editableOrganizer(user.id)},select:{id:true}})
  if(!org)throw errors.forbidden('Only the organizer owner or an authorized administrator may edit branding.')
  const form=await req.formData().catch(()=>null)
  const file=form?.get('file'),purpose=form?.get('purpose')
  if(purpose!=='logo'&&purpose!=='cover')throw errors.badRequest('Choose profile picture or banner.')
  if(!(file instanceof File)||file.size<1||file.size>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose an image up to 5 MB.')
  const bytes=Buffer.from(await file.arrayBuffer())
  if(!isSupportedImage(bytes,file.type))throw errors.badRequest('Choose a valid JPG, PNG or WebP image.')
  let safe:Buffer
  try{
   const image=sharp(bytes,{limitInputPixels:20000000}).rotate()
   safe=await (purpose==='logo'?image.resize(512,512,{fit:'contain',background:{r:255,g:255,b:255,alpha:0}}):image.resize(1600,600,{fit:'cover',position:'attention'})).webp({quality:85}).toBuffer()
  }catch{throw errors.badRequest('The image could not be decoded.')}
  if(safe.length>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose a smaller image.')
  const filename=randomUUID()+'.webp',url='/uploads/'+filename
  try{await mkdir(mediaStorageDirectory(),{recursive:true,mode:0o755});await writeFile(mediaFilePath(filename),safe,{flag:'wx',mode:0o644})}catch{throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE','Image storage is temporarily unavailable.')}
  try{
   await db.$transaction(async tx=>{
    const result=await tx.organization.updateMany({where:{id:org.id,...editableOrganizer(user.id)},data:purpose==='logo'?{logoUrl:url}:{coverUrl:url}})
    if(result.count!==1)throw errors.forbidden('This profile can no longer be edited.')
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'profile-editor',action:'org.profile.branding',entityType:'Organization',entityId:org.id,after:JSON.stringify({purpose,url})}})
   })
  }catch(error){await unlink(mediaFilePath(filename)).catch(()=>{});throw error}
  return jsonOk({url},{status:201,headers:{'Cache-Control':'private, no-store'}})
 })
}
