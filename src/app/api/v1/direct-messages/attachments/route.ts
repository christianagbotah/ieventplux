import {NextRequest,NextResponse} from 'next/server'
import {errors,handle,jsonOk,rateLimit,requireUser} from '@/server/api'
import {validDirectId,parseDirectMessage} from '@/server/direct-message-policy'
import {attachmentsEnabled,voiceMime} from '@/server/direct-attachment-policy'
import {boundedMultipart,prepareDirectAttachment,readDirectAttachment,requireAttachmentKey} from '@/server/services/direct-attachments'
import {assertAttachmentContact,sendDirectMessage} from '@/server/services/direct-messages'
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}
export async function GET(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  const messageId=req.nextUrl.searchParams.get('messageId')
  if(!messageId)return jsonOk({enabled:attachmentsEnabled(process.env),maxBytes:2097152},{headers})
  if(req.nextUrl.searchParams.get('expectedUserId')!==user.id)throw errors.conflict('The signed-in account changed.')
  if(!validDirectId(messageId))throw errors.badRequest('Invalid attachment.')
  await rateLimit(req,'direct-attachment-read',60,60_000)
  const file=await readDirectAttachment(messageId,user.id)
  if(req.nextUrl.searchParams.get('encoding')==='base64')return jsonOk({filename:file.filename,mime:file.mime,size:file.size,base64:file.bytes.toString('base64')},{headers})
  return new NextResponse(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':file.mime,'Content-Length':String(file.size),'Content-Disposition':'attachment; filename="'+file.filename+'"','Content-Security-Policy':"default-src 'none'; sandbox"}})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  requireAttachmentKey(true)
  await rateLimit(req,'direct-attachment-send',15,60_000)
  const form=await boundedMultipart(req)
  const id=form.get('id'),file=form.get('file'),caption=form.get('caption')
  if(form.get('expectedUserId')!==user.id)throw errors.conflict('The signed-in account changed.')
  if(!validDirectId(id)||!(file instanceof File)||typeof caption!=='string'||form.getAll('file').length!==1)throw errors.badRequest('Invalid private attachment.')
  const input=parseDirectMessage({body:caption.trim()||(voiceMime(file.type)?'Voice message':file.type==='application/pdf'?'PDF attachment':'Image attachment'),clientKey:form.get('clientKey')})
  if(!input)throw errors.badRequest('Invalid caption or message key.')
  await assertAttachmentContact(id,user.id)
  const prepared=await prepareDirectAttachment(file)
  return jsonOk(await sendDirectMessage(id,user.id,input,prepared),{headers})
 })
}
