import sharp from 'sharp'
import {db} from '../../lib/db'
import {ApiError,errors} from '../api'
import {isSupportedImage} from '../media-storage'
import {MAX_DIRECT_FILE,MAX_DIRECT_MULTIPART,attachmentKey,attachmentsEnabled,safeAttachmentName,pdfSignature,digestAttachment,decryptAttachment} from '../direct-attachment-policy'
export type PreparedAttachment={filename:string;mime:'image/webp'|'application/pdf';size:number;digest:string;bytes:Buffer}
export const attachmentMetadata={filename:true,mime:true,size:true} as const
export function requireAttachmentKey(write=false){
 const key=attachmentKey(process.env)
 if(!key||(write&&!attachmentsEnabled(process.env)))throw errors.unavailable('ATTACHMENTS_UNAVAILABLE','Private attachments are not enabled.')
 return key
}
export async function boundedMultipart(req:Request){
 const contentType=req.headers.get('content-type')??''
 if(!/^multipart\/form-data;.*boundary=/i.test(contentType)||contentType.length>256)throw errors.badRequest('Choose a file to attach.')
 const declared=req.headers.get('content-length')
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_DIRECT_MULTIPART))throw errors.badRequest('Attachment exceeds the 2 MB limit.')
 const reader=req.body?.getReader()
 if(!reader)throw errors.badRequest('Missing upload.')
 const chunks:Buffer[]=[]
 let total=0
 try{
  while(true){
   const {done,value}=await reader.read()
   if(done)break
   total+=value.byteLength
   if(total>MAX_DIRECT_MULTIPART){await reader.cancel();throw errors.badRequest('Attachment exceeds the 2 MB limit.')}
   chunks.push(Buffer.from(value))
  }
 }finally{reader.releaseLock()}
 try{return await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{'Content-Type':contentType}}).formData()}
 catch{throw errors.badRequest('Invalid attachment upload.')}
}
export async function prepareDirectAttachment(file:File):Promise<PreparedAttachment>{
 if(file.size<1||file.size>MAX_DIRECT_FILE)throw errors.badRequest('Choose a file no larger than 2 MB.')
 const raw=Buffer.from(await file.arrayBuffer())
 let bytes:Buffer,mime:PreparedAttachment['mime']
 if(file.type==='application/pdf'){
  if(!pdfSignature(raw))throw errors.badRequest('Invalid PDF document.')
  bytes=raw;mime='application/pdf'
 }else{
  if(!isSupportedImage(raw,file.type))throw errors.badRequest('Only JPEG, PNG, WebP and PDF are supported.')
  try{
   bytes=await sharp(raw,{limitInputPixels:12_000_000,failOn:'error'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer()
  }catch{throw errors.badRequest('Invalid or unreadable image.')}
  mime='image/webp'
 }
 if(bytes.length<1||bytes.length>MAX_DIRECT_FILE)throw errors.badRequest('Prepared attachment exceeds the 2 MB limit.')
 return {filename:safeAttachmentName(file.name,mime),mime,size:bytes.length,digest:digestAttachment(bytes),bytes}
}
export async function readDirectAttachment(messageId:string,userId:string){
 const key=requireAttachmentKey()
 try{
  const row=await db.directAttachment.findFirst({where:{messageId,message:{removedAt:null,conversation:{status:'ACCEPTED',OR:[{participantLowId:userId},{participantHighId:userId}]}}},select:{messageId:true,filename:true,mime:true,size:true,digest:true,payload:true}})
  if(!row)throw errors.notFound('Attachment unavailable.')
  const bytes=decryptAttachment(row.payload,key,row.messageId)
  if(bytes.length!==row.size||digestAttachment(bytes)!==row.digest)throw new Error('Attachment integrity failed.')
  return {filename:row.filename,mime:row.mime,size:row.size,bytes}
 }catch(err){
  if(err instanceof ApiError)throw err
  throw errors.unavailable('ATTACHMENT_UNAVAILABLE','Attachment is temporarily unavailable.')
 }
}
