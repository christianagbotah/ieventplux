import {Prisma,type DirectCall,type Notification} from '@prisma/client'
import {db} from '../../lib/db'
import {ApiError,errors} from '../api'
import {RING_MS,ACCEPTED_INVITATION_MS,nextCallState,type CallAction,type CallKind} from '../direct-call-policy'
import {publishNotification} from './notify'
import {realtimeEmit} from './realtime'
type Tx=Prisma.TransactionClient
type Actor={userId:string;sessionId:string}
const participant=(userId:string)=>({OR:[{participantLowId:userId},{participantHighId:userId}]})
const publicCall=(c:DirectCall,actor:Actor)=>({id:c.id,conversationId:c.conversationId,callerId:c.callerId,calleeId:c.calleeId,kind:c.kind,status:c.status,createdAt:c.createdAt,expiresAt:c.expiresAt,acceptedAt:c.acceptedAt,endedAt:c.endedAt,thisDevice:actor.sessionId===(actor.userId===c.callerId?c.callerSessionId:c.acceptedSessionId),mediaConnected:false})
async function transaction<T>(fn:(tx:Tx)=>Promise<T>){
 try{return await db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
 catch(err){if(err instanceof ApiError)throw err;if(err&&typeof err==='object'&&'code' in err&&['P2002','P2034'].includes(String(err.code)))throw errors.conflict('Call state changed. Refresh and retry.');throw errors.unavailable('CALL_UNAVAILABLE','Call invitations are temporarily unavailable.')}
}
async function contactAllowed(tx:Tx,a:string,b:string){
 const count=await tx.user.count({where:{id:{in:[a,b]},status:'ACTIVE',deletedAt:null}})
 if(count!==2)return false
 return !await tx.userBlock.findFirst({where:{OR:[{blockerId:a,blockedId:b},{blockerId:b,blockedId:a}]},select:{blockerId:true}})
}
async function validContact(tx:Tx,a:string,b:string){
 const count=await tx.user.count({where:{id:{in:[a,b]},status:'ACTIVE',deletedAt:null}})
 if(count!==2)throw errors.notFound('Contact unavailable.')
 if(await tx.userBlock.findFirst({where:{OR:[{blockerId:a,blockedId:b},{blockerId:b,blockedId:a}]},select:{blockerId:true}}))throw errors.forbidden('Contact unavailable.')
}
async function validSession(tx:Tx,actor:Actor,now:Date){
 if(!await tx.session.findFirst({where:{id:actor.sessionId,userId:actor.userId,revokedAt:null,expiresAt:{gt:now}},select:{id:true}}))throw errors.unauthorized()
}
async function notice(tx:Tx,c:DirectCall,type:'DIRECT_CALL_INVITE'|'DIRECT_CALL_MISSED'){
 if(await tx.userMute.findUnique({where:{muterId_mutedId:{muterId:c.calleeId,mutedId:c.callerId}},select:{muterId:true}}))return null
 const allowed=await tx.user.count({where:{id:c.calleeId,status:'ACTIVE',deletedAt:null}})
 if(!allowed)return null
 if(await tx.userBlock.findFirst({where:{OR:[{blockerId:c.callerId,blockedId:c.calleeId},{blockerId:c.calleeId,blockedId:c.callerId}]},select:{blockerId:true}}))return null
 return tx.notification.create({data:{userId:c.calleeId,type,title:type==='DIRECT_CALL_MISSED'?'Missed call':'Incoming call',body:type==='DIRECT_CALL_MISSED'?'A private call invitation expired.':'You have a private call invitation.',link:'#/messages/'+c.conversationId}})
}
async function relay(c:DirectCall,n:Notification|null){
 await Promise.all([...(n?[publishNotification(n)]:[]),realtimeEmit('user:'+c.callerId,'direct:changed',{}),realtimeEmit('user:'+c.calleeId,'direct:changed',{})])
}
async function expire(tx:Tx,c:DirectCall,now:Date){
 if(!['RINGING','ACCEPTED'].includes(c.status)||c.expiresAt>now)return null
 const next=c.status==='RINGING'?'MISSED':'ENDED'
 const changed=await tx.directCall.updateMany({where:{id:c.id,status:c.status,expiresAt:{lte:now}},data:{status:next,endedAt:now}})
 if(!changed.count)return null
 await tx.directCallSlot.deleteMany({where:{callId:c.id}})
 const n=next==='MISSED'?await notice(tx,c,'DIRECT_CALL_MISSED'):null
 return {call:{...c,status:next,endedAt:now},notification:n}
}
async function invalidate(tx:Tx,c:DirectCall,now:Date){
 if(!['RINGING','ACCEPTED'].includes(c.status))return null
 const caller=await tx.session.findFirst({where:{id:c.callerSessionId,userId:c.callerId,revokedAt:null,expiresAt:{gt:now}},select:{id:true}})
 const callee=c.status==='ACCEPTED'&&c.acceptedSessionId?await tx.session.findFirst({where:{id:c.acceptedSessionId,userId:c.calleeId,revokedAt:null,expiresAt:{gt:now}},select:{id:true}}):null
 if(caller&&(c.status==='RINGING'||callee)&&await contactAllowed(tx,c.callerId,c.calleeId))return null
 const status=c.status==='RINGING'?'CANCELLED':'ENDED'
 const changed=await tx.directCall.updateMany({where:{id:c.id,status:c.status},data:{status,endedAt:now}})
 if(!changed.count)return null
 await tx.directCallSlot.deleteMany({where:{callId:c.id}})
 return {call:{...c,status,endedAt:now},notification:null}
}
export async function sweepDirectCalls(limit=50){
 const now=new Date()
 const bounded=Math.max(1,Math.min(limit,50))
 // Pick only expired or invalid active invitations; do not scan the first
 // N healthy calls repeatedly and starve revoked calls behind them.
 const due=await db.$queryRaw<{id:string}[]>`
 SELECT c.id FROM "DirectCall" c
 WHERE c.status IN ('RINGING','ACCEPTED') AND (
 c."expiresAt" <= ${now}
 OR NOT EXISTS (SELECT 1 FROM "Session" s WHERE s.id=c."callerSessionId" AND s."userId"=c."callerId" AND s."revokedAt" IS NULL AND s."expiresAt" > ${now})
 OR (c.status='ACCEPTED' AND NOT EXISTS (SELECT 1 FROM "Session" s WHERE s.id=c."acceptedSessionId" AND s."userId"=c."calleeId" AND s."revokedAt" IS NULL AND s."expiresAt" > ${now}))
 OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id=c."callerId" AND u.status='ACTIVE' AND u."deletedAt" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id=c."calleeId" AND u.status='ACTIVE' AND u."deletedAt" IS NULL)
 OR EXISTS (SELECT 1 FROM "UserBlock" b WHERE (b."blockerId"=c."callerId" AND b."blockedId"=c."calleeId") OR (b."blockerId"=c."calleeId" AND b."blockedId"=c."callerId"))
 ) ORDER BY c."expiresAt",c.id LIMIT ${bounded}`

 let count=0
 for(const row of due){
  const result=await transaction(async tx=>{
   const current=await tx.directCall.findUnique({where:{id:row.id}})
   if(!current)return null
   // Revocation/block takes precedence over a missed-call notification.
   return await invalidate(tx,current,now)??await expire(tx,current,now)
  })
  if(result){count++;await relay(result.call,result.notification)}
 }
 return count
}
export async function startDirectCall(id:string,actor:Actor,kind:CallKind,clientKey:string){
 // Free timed-out slots before attempting new calls; the serializable slot insert
 // still protects against races between different conversations.
 await sweepDirectCalls()
 const result=await transaction(async tx=>{
  const now=new Date()
  await validSession(tx,actor,now)
  const c=await tx.directConversation.findFirst({where:{id,...participant(actor.userId)}})
  if(!c)throw errors.notFound('Conversation not found.')
  if(c.status!=='ACCEPTED')throw errors.forbidden('Accept the conversation before calling.')
  const calleeId=c.participantLowId===actor.userId?c.participantHighId:c.participantLowId
  const prior=await tx.directCall.findUnique({where:{conversationId_callerId_clientKey:{conversationId:id,callerId:actor.userId,clientKey}}})
  if(prior){if(prior.kind!==kind)throw errors.conflict('Call key already used.');return {call:prior,notification:null,replayed:true}}
  await validContact(tx,actor.userId,calleeId)
  if(await tx.directCallSlot.findFirst({where:{userId:{in:[actor.userId,calleeId]}},select:{userId:true}}))throw errors.conflict('A participant is already handling a call.')
  const call=await tx.directCall.create({data:{conversationId:id,callerId:actor.userId,calleeId,callerSessionId:actor.sessionId,clientKey,kind,createdAt:now,expiresAt:new Date(+now+RING_MS)}})
  await tx.directCallSlot.createMany({data:[{userId:actor.userId,callId:call.id},{userId:calleeId,callId:call.id}]})
  const notification=await notice(tx,call,'DIRECT_CALL_INVITE')
  return {call,notification,replayed:false}
 })
 if(!result.replayed)await relay(result.call,result.notification)
 return {call:publicCall(result.call,actor),replayed:result.replayed}
}
export async function changeDirectCall(id:string,actor:Actor,action:CallAction){
 const result=await transaction(async tx=>{
  const now=new Date()
  await validSession(tx,actor,now)
  const c=await tx.directCall.findFirst({where:{id,conversation:participant(actor.userId)}})
  if(!c)throw errors.notFound('Call not found.')
  const expired=await invalidate(tx,c,now)??await expire(tx,c,now)
  if(expired)return expired
  if(action==='accept'&&c.status==='ACCEPTED'&&c.calleeId===actor.userId&&c.acceptedSessionId===actor.sessionId)return {call:c,notification:null}
  if(!['RINGING','ACCEPTED'].includes(c.status))return {call:c,notification:null}
  const next=nextCallState(c,actor.userId,actor.sessionId,action,now)
  if(!next)throw errors.forbidden('This device cannot perform that call action.')
  if(next==='ACCEPTED'){
   await validContact(tx,c.callerId,c.calleeId)
   await validSession(tx,{userId:c.callerId,sessionId:c.callerSessionId},now)
  }
  const call=await tx.directCall.update({where:{id:c.id},data:next==='ACCEPTED'?{status:next,acceptedAt:now,acceptedSessionId:actor.sessionId,expiresAt:new Date(+now+ACCEPTED_INVITATION_MS)}:{status:next,endedAt:now}})
  if(next!=='ACCEPTED')await tx.directCallSlot.deleteMany({where:{callId:id}})
  return {call,notification:null}
 })
 await relay(result.call,result.notification)
 return {call:publicCall(result.call,actor)}
}
export async function listDirectCalls(actor:Actor,conversationId:string|null){
 await sweepDirectCalls()
 if(conversationId&&!await db.directConversation.findFirst({where:{id:conversationId,...participant(actor.userId)},select:{id:true}}))throw errors.notFound('Conversation not found.')
 const rows=await db.directCall.findMany({where:{conversation:participant(actor.userId),...(conversationId?{conversationId}:{status:{in:['RINGING','ACCEPTED']},expiresAt:{gt:new Date()}})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50})
 return {items:rows.map(c=>publicCall(c,actor)),mediaAvailable:false}
}
