import {NextRequest} from 'next/server'
import {errors,handle,jsonOk,rateLimit,readJson,requireSession} from '@/server/api'
import {validDirectId} from '@/server/direct-message-policy'
import {invitationPilotEnabled,type CallAction} from '@/server/direct-call-policy'
import {startDirectCall,changeDirectCall,listDirectCalls} from '@/server/services/direct-calls'
const headers={'Cache-Control':'private, no-store'}
export async function GET(req:NextRequest){
 return handle(async()=>{
  const {user,sessionId}=await requireSession()
  if(!invitationPilotEnabled(process.env))return jsonOk({enabled:false,mediaAvailable:false,items:[]},{headers})
  const id=req.nextUrl.searchParams.get('conversationId')
  if(req.nextUrl.searchParams.get('expectedUserId')!==user.id)throw errors.conflict('The signed-in account changed.')
  if(id!==null&&!validDirectId(id))throw errors.badRequest('Invalid conversation.')
  await rateLimit(req,'direct-call-list',60,60_000)
  return jsonOk({enabled:true,...await listDirectCalls({userId:user.id,sessionId},id)},{headers})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  const {user,sessionId}=await requireSession()
  if(!invitationPilotEnabled(process.env))throw errors.unavailable('CALLS_NOT_AVAILABLE','Personal calls are not enabled.')
  const body=await readJson<Record<string,unknown>>(req)
  if(!body||body.expectedUserId!==user.id)throw errors.conflict('The signed-in account changed.')
  const actor={userId:user.id,sessionId}
  if(body.action==='start'){
   await rateLimit(req,'direct-call-start',10,60_000)
   if(!validDirectId(body.conversationId)||(body.kind!=='VOICE'&&body.kind!=='VIDEO')||typeof body.clientKey!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(body.clientKey))throw errors.badRequest('Invalid call invitation.')
   return jsonOk(await startDirectCall(body.conversationId,actor,body.kind,body.clientKey),{headers})
  }
  await rateLimit(req,'direct-call-action',30,60_000)
  if(!validDirectId(body.id)||typeof body.action!=='string'||!['accept','decline','cancel','end'].includes(body.action))throw errors.badRequest('Invalid call action.')
  return jsonOk(await changeDirectCall(body.id,actor,body.action as CallAction),{headers})
 })
}
