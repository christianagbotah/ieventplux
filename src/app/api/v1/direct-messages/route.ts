import {NextRequest} from 'next/server'
import {errors,handle,jsonOk,rateLimit,readJson,requireUser,requireSession} from '@/server/api'
import {validDirectId,parseDirectMessage} from '@/server/direct-message-policy'
import {parseActivity} from '@/server/direct-activity-policy'
import {parseDirectReport} from '@/server/direct-report-policy'
import {requestConversation,decideConversation,sendDirectMessage,readDirectMessages,listDirectConversations,getDirectConversation,listDirectContacts,directActivity,reportDirectMessage,setDirectSafety,directSendStatus} from '@/server/services/direct-messages'
const headers={'Cache-Control':'private, no-store'}
const ok=(value:unknown)=>jsonOk(value,{headers})
export async function GET(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  const query=req.nextUrl.searchParams
  if(query.get('contacts')==='1')return ok(await listDirectContacts(user.id,(query.get('q')??'').trim().slice(0,80)))
  const id=query.get('id'),before=query.get('before')
  if(id!==null){
   if(!validDirectId(id)||(before!==null&&!validDirectId(before)))throw errors.badRequest('Invalid conversation or cursor.')
   return ok(await getDirectConversation(id,user.id,before))
  }
  const page=Number(query.get('page')??'1')
  if(!Number.isSafeInteger(page)||page<1||page>1000)throw errors.badRequest('Invalid conversation page.')
  return ok(await listDirectConversations(user.id,page))
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const user=await requireUser()
  const body=await readJson<Record<string,unknown>>(req)
  if(!body||body.expectedUserId!==user.id)throw errors.conflict('The signed-in account changed.')
  if(body.action==='request'){
   await rateLimit(req,'direct-request',10,60_000)
   if(!validDirectId(body.userId))throw errors.badRequest('Invalid contact.')
   return ok({conversation:await requestConversation(user.id,body.userId)})
  }
  const id=body.id
  if(!validDirectId(id))throw errors.badRequest('Invalid conversation.')
  if(body.action==='send-status'){
   await rateLimit(req,'direct-send-status',60,60_000)
   if(typeof body.clientKey!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(body.clientKey))throw errors.badRequest('Invalid message key.')
   return ok(await directSendStatus(id,user.id,body.clientKey))
  }
  if(body.action==='safety'){
   await rateLimit(req,'direct-safety',30,60_000)
   if((body.kind!=='block'&&body.kind!=='mute')||typeof body.enabled!=='boolean')throw errors.badRequest('Invalid chat safety setting.')
   return ok(await setDirectSafety(id,user.id,body.kind,body.enabled))
  }
  if(body.action==='report'){
   await rateLimit(req,'direct-report',10,60_000)
   const input=parseDirectReport(body)
   if(!input||!validDirectId(body.messageId))throw errors.badRequest('Choose a report reason and message.')
   return ok(await reportDirectMessage(id,user.id,body.messageId,input))
  }
  if(body.action==='activity'){
   const input=parseActivity(body)
   if(!input)throw errors.badRequest('Invalid chat activity.')
   const session=await requireSession()
   if(session.user.id!==user.id)throw errors.conflict('The signed-in account changed.')
   await rateLimit(req,'direct-activity',120,60_000)
   return ok(await directActivity(id,user.id,session.sessionId,input))
  }
  if(body.action==='accept'||body.action==='decline'){
   await rateLimit(req,'direct-decision',30,60_000)
   return ok({conversation:await decideConversation(id,user.id,body.action==='accept')})
  }
  if(body.action==='send'){
   await rateLimit(req,'direct-send',60,60_000)
   const parsed=parseDirectMessage(body)
   if(!parsed)throw errors.badRequest('Enter a message of up to 4000 characters and a valid message key.')
   return ok(await sendDirectMessage(id,user.id,parsed))
  }
  if(body.action==='read'){
   await rateLimit(req,'direct-read',90,60_000)
   if(!validDirectId(body.throughId))throw errors.badRequest('Invalid read position.')
   return ok(await readDirectMessages(id,user.id,body.throughId))
  }
  throw errors.badRequest('Invalid messaging action.')
 })
}
