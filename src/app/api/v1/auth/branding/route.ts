import {NextRequest} from 'next/server'
import {handle,jsonOk,requireUser,errors,rateLimit} from '@/server/api'
import {db} from '@/lib/db'
import {isSupportedImage,mediaFilePath,mediaStorageDirectory,MAX_UPLOAD_BYTES} from '@/server/media-storage'
import {randomUUID} from 'node:crypto'
import {mkdir,unlink,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
export async function POST(req:NextRequest){return handle(async()=>{
 const user=await requireUser();await rateLimit(req,'user-profile-branding',12,60000)
 const form=await req.formData().catch(()=>null),file=form?.get('file'),purpose=form?.get('purpose')
 if(form?.get('expectedUserId')!==user.id)throw errors.conflict('The signed-in account changed.')
 if(purpose!=='avatar'&&purpose!=='banner')throw errors.badRequest('Choose profile picture or banner.')
 if(!(file instanceof File)||file.size<1||file.size>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose an image up to 5 MB.')
 const bytes=Buffer.from(await file.arrayBuffer());if(!isSupportedImage(bytes,file.type))throw errors.badRequest('Choose a valid JPG, PNG or WebP image.')
 let safe:Buffer;try{const image=sharp(bytes,{limitInputPixels:20000000}).rotate();safe=await (purpose==='avatar'?image.resize(512,512,{fit:'cover'}):image.resize(1600,600,{fit:'cover',position:'attention'})).webp({quality:85}).toBuffer()}catch{throw errors.badRequest('The image could not be decoded.')}
 if(safe.length>MAX_UPLOAD_BYTES)throw errors.badRequest('Choose a smaller image.')
 const filename=randomUUID()+'.webp',url='/uploads/'+filename
 try{await mkdir(mediaStorageDirectory(),{recursive:true,mode:0o755});await writeFile(mediaFilePath(filename),safe,{flag:'wx',mode:0o644})}catch{throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE','Image storage is temporarily unavailable.')}
 try{await db.$transaction(async tx=>{const result=await tx.user.updateMany({where:{id:user.id,status:'ACTIVE',deletedAt:null},data:purpose==='avatar'?{avatarUrl:url}:{bannerUrl:url}});if(result.count!==1)throw errors.forbidden('This account can no longer be edited.');await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'account-owner',action:'user.profile.branding',entityType:'User',entityId:user.id,after:JSON.stringify({purpose,url})}})})}catch(e){await unlink(mediaFilePath(filename)).catch(()=>{});throw e}
 return jsonOk({url},{status:201,headers:{'Cache-Control':'private, no-store'}})
})}
