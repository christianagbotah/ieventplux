import { NextRequest } from 'next/server'
import { handle,jsonOk,requireUser,errors,rateLimit } from '@/server/api'
import { ownedStore } from '@/server/services/marketplace'
import { isSupportedImage,mediaFilePath,mediaStorageDirectory,MAX_UPLOAD_BYTES } from '@/server/media-storage'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { unlink,mkdir,writeFile } from 'node:fs/promises'
import sharp from 'sharp'

export async function POST(req:NextRequest,ctx:{params:Promise<{slug:string}>}){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'marketplace-image',20,60000)
  const store=await ownedStore((await ctx.params).slug,user.id)
  if(store.status==='SUSPENDED')throw errors.forbidden('Suspended stores cannot upload images.')
  const form=await req.formData().catch(()=>null)
  const file=form?.get('file')
  const purpose=form?.get('purpose')??'product'
  if(purpose!=='product'&&purpose!=='logo'&&purpose!=='cover')throw errors.badRequest('Choose a valid image purpose.')
  if(!(file instanceof File)||file.size<1||file.size>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose an image of up to 5 MB.')
  const bytes=Buffer.from(await file.arrayBuffer())
  if(!isSupportedImage(bytes,file.type))throw errors.badRequest('Choose a valid JPG, PNG or WebP image.')
  let safe:Buffer
  try{safe=await sharp(bytes,{limitInputPixels:20000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer()}catch{throw errors.badRequest('The image could not be decoded.')}
  if(safe.length>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose a smaller image.')
  const filename=randomUUID()+'.webp'
  try{await mkdir(mediaStorageDirectory(),{recursive:true,mode:0o755});await writeFile(mediaFilePath(filename),safe,{flag:'wx',mode:0o644})}catch{throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE','Image storage is temporarily unavailable.')}
  const url='/uploads/'+filename
  if(purpose!=='product'){
    try{
      await db.$transaction(async tx=>{
        const result=await tx.marketplaceStore.updateMany({where:{id:store.id,ownerId:user.id,deletedAt:null,status:{not:'SUSPENDED'}},data:purpose==='logo'?{logoUrl:url}:{coverUrl:url}})
        if(result.count!==1)throw errors.forbidden('This store can no longer be edited.')
        await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'store-owner',action:'marketplace.store.branding',entityType:'MarketplaceStore',entityId:store.id,after:JSON.stringify({purpose,url})}})
      })
    }catch(error){await unlink(mediaFilePath(filename)).catch(()=>{});throw error}
  }
  return jsonOk({url},{status:201})
 })
}
