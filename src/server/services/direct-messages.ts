import {createHash} from 'node:crypto'
import {Prisma,type DirectConversation,type Notification} from '@prisma/client'
import {db} from '../../lib/db'
import {ApiError,errors} from '../api'
import {canonicalPair,mayDecide} from '../direct-message-policy'
import {activityWindow} from '../direct-activity-policy'
import {removedMessageBody,type DirectReportReason} from '../direct-report-policy'
import {publishNotification} from './notify'
import {realtimeEmit} from './realtime'

type Tx=Prisma.TransactionClient
const profile={id:true,displayName:true,avatarUrl:true} as const
const participants=(userId:string)=>({OR:[{participantLowId:userId},{participantHighId:userId}]})
function peer(c:DirectConversation,userId:string){return c.participantLowId===userId?c.participantHighId:c.participantLowId}
async function scoped(tx:Tx,id:string,userId:string){
 const row=await tx.directConversation.findFirst({where:{id,...participants(userId)}})
 if(!row)throw errors.notFound('Conversation not found.')
 return row
}
async function canContact(tx:Tx,a:string,b:string){
 const count=await tx.user.count({where:{id:{in:[a,b]},status:'ACTIVE',deletedAt:null}})
 if(count!==2)throw errors.notFound('Contact unavailable.')
 const block=await tx.userBlock.findFirst({where:{OR:[{blockerId:a,blockedId:b},{blockerId:b,blockedId:a}]},select:{blockerId:true}})
 if(block)throw errors.forbidden('This contact is unavailable.')
}
async function transaction<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
 try{return await db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
 catch(err){
  if(err instanceof ApiError)throw err
  if(err&&typeof err==='object'&&'code' in err&&['P2034','P2002'].includes(String(err.code)))throw errors.conflict('Conversation changed. Retry the same action.')
  // Do not pass database error text containing private messages to generic logging.
  throw errors.unavailable('MESSAGING_UNAVAILABLE','Messaging is temporarily unavailable.')
 }
}
async function notice(tx:Tx,userId:string,senderId:string,conversationId:string,type:string,title:string,body:string){
 const muted=await tx.userMute.findUnique({where:{muterId_mutedId:{muterId:userId,mutedId:senderId}},select:{muterId:true}})
 if(muted)return null
 return tx.notification.create({data:{userId,type,title,body,link:'#/messages/'+conversationId}})
}
async function relay(c:DirectConversation,n:Notification|null){
 await Promise.all([
  ...(n?[publishNotification(n)]:[]),
  realtimeEmit('user:'+c.participantLowId,'direct:changed',{}),
  realtimeEmit('user:'+c.participantHighId,'direct:changed',{}),
 ])
}
export async function requestConversation(actorId:string,otherId:string){
 if(actorId===otherId)throw errors.badRequest('Choose another person.')
 const pair=canonicalPair(actorId,otherId)
 const result=await transaction(async tx=>{
  await canContact(tx,actorId,otherId)
  const existing=await tx.directConversation.findUnique({where:{participantLowId_participantHighId:pair}})
  if(existing)return {conversation:existing,notification:null}
  const conversation=await tx.directConversation.create({data:{...pair,requesterId:actorId}})
  const notification=await notice(tx,otherId,actorId,conversation.id,'DIRECT_REQUEST','New message request','Someone would like to start a private conversation.')
  return {conversation,notification}
 })
 if(result.notification)await relay(result.conversation,result.notification)
 return result.conversation
}
export async function decideConversation(id:string,actorId:string,accept:boolean){
 const result=await transaction(async tx=>{
  const c=await scoped(tx,id,actorId)
  if(c.requesterId===actorId)throw errors.forbidden('Only the recipient can decide this request.')
  if(!mayDecide(c.status,c.requesterId,actorId)){
   if(c.status===(accept?'ACCEPTED':'DECLINED'))return {conversation:c,notification:null,changed:false}
   throw errors.conflict('This request has already been decided.')
  }
  if(accept)await canContact(tx,actorId,peer(c,actorId))
  const conversation=await tx.directConversation.update({where:{id},data:{status:accept?'ACCEPTED':'DECLINED'}})
  const notification=accept?await notice(tx,c.requesterId,actorId,id,'DIRECT_ACCEPTED','Message request accepted','Your private conversation is ready.'):null
  return {conversation,notification,changed:true}
 })
 if(result.changed)await relay(result.conversation,result.notification)
 return result.conversation
}
export async function sendDirectMessage(id:string,actorId:string,input:{body:string;clientKey:string}){
 const result=await transaction(async tx=>{
  const c=await scoped(tx,id,actorId)
  const other=peer(c,actorId)
  if(c.status!=='ACCEPTED')throw errors.forbidden('The recipient must accept this conversation first.')
  await canContact(tx,actorId,other)
  const prior=await tx.directMessage.findUnique({where:{conversationId_senderId_clientKey:{conversationId:id,senderId:actorId,clientKey:input.clientKey}}})
  if(prior){
   if(prior.removedAt) return {message:{...prior,body:removedMessageBody},conversation:c,notification:null,replayed:true}
   if(prior.body!==input.body)throw errors.conflict('This message key was already used.')
   return {message:prior,conversation:c,notification:null,replayed:true}
  }
  const message=await tx.directMessage.create({data:{conversationId:id,senderId:actorId,...input}})
  const conversation=await tx.directConversation.update({where:{id},data:{updatedAt:new Date()}})
  const notification=await notice(tx,other,actorId,id,'DIRECT_MESSAGE','New private message','You have a new private message.')
  return {message,conversation,notification,replayed:false}
 })
 if(!result.replayed)await relay(result.conversation,result.notification)
 return {message:result.message,replayed:result.replayed}
}
export async function readDirectMessages(id:string,actorId:string,throughId:string){
 const result=await transaction(async tx=>{
  const c=await scoped(tx,id,actorId)
  const anchor=await tx.directMessage.findFirst({where:{id:throughId,conversationId:id},select:{id:true,createdAt:true}})
  if(!anchor)throw errors.badRequest('Invalid read position.')
  const changed=await tx.directMessage.updateMany({where:{conversationId:id,senderId:peer(c,actorId),readAt:null,OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lte:anchor.id}}]},data:{readAt:new Date()}})
  return {c,count:changed.count}
 })
 if(result.count)await relay(result.c,null)
 return {marked:result.count}
}
export async function listDirectConversations(userId:string,page:number){
 const rows=await db.directConversation.findMany({where:participants(userId),orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:(page-1)*30,take:31,include:{participantLow:{select:profile},participantHigh:{select:profile},_count:{select:{messages:{where:{senderId:{not:userId},readAt:null}}}}}})
 return {items:rows.slice(0,30).map(c=>({id:c.id,status:c.status,requesterId:c.requesterId,updatedAt:c.updatedAt,peer:c.participantLowId===userId?c.participantHigh:c.participantLow,unread:c._count.messages})),hasMore:rows.length>30}
}
export async function getDirectConversation(id:string,userId:string,before:string|null){
 const c=await scoped(db,id,userId)
 const otherId=peer(c,userId)
 const other=await db.user.findUnique({where:{id:otherId},select:profile})
 const block=await db.userBlock.findFirst({where:{OR:[{blockerId:userId,blockedId:otherId},{blockerId:otherId,blockedId:userId}]},select:{blockerId:true}})
 const active=await db.user.count({where:{id:otherId,status:'ACTIVE',deletedAt:null}})
 const muted=await db.userMute.findUnique({where:{muterId_mutedId:{muterId:userId,mutedId:otherId}},select:{muterId:true}})
 const blockedByMe=await db.userBlock.findUnique({where:{blockerId_blockedId:{blockerId:userId,blockedId:otherId}},select:{blockerId:true}})
 const anchor=before?await db.directMessage.findFirst({where:{id:before,conversationId:id},select:{id:true,createdAt:true}}):null
 if(before&&!anchor)throw errors.badRequest('Invalid message cursor.')
 const rows=await db.directMessage.findMany({where:{conversationId:id,...(anchor?{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:31,select:{id:true,senderId:true,body:true,createdAt:true,readAt:true,removedAt:true}})
 return {conversation:{id:c.id,status:c.status,requesterId:c.requesterId,peer:other,canSend:c.status==='ACCEPTED'&&!block&&active===1,blockedByMe:!!blockedByMe,mutedByMe:!!muted},items:rows.slice(0,30).map(m=>m.removedAt?{...m,body:removedMessageBody}:m),nextCursor:rows.length>30?rows[29]?.id??null:null}
}

export async function listDirectContacts(userId:string,query:string){
 const blocks=await db.userBlock.findMany({where:{OR:[{blockerId:userId},{blockedId:userId}]},select:{blockerId:true,blockedId:true}})
 const excluded=[userId,...blocks.map(b=>b.blockerId===userId?b.blockedId:b.blockerId)]
 return {items:await db.user.findMany({
  where:{id:{notIn:excluded},status:'ACTIVE',deletedAt:null,
   ...(query?{displayName:{contains:query,mode:'insensitive' as const}}:{}),
   OR:[{followsGiven:{some:{userId}}},{followsReceived:{some:{followerId:userId}}}]},
  orderBy:[{displayName:'asc'},{id:'asc'}],take:40,select:profile,
 })}
}

/** Presence is "active in this chat", not a global online/last-seen tracker.
 * Sessions may independently stop sharing. No activity is returned on a
 * pending, declined, blocked or suspended conversation. */
export async function directActivity(id:string,actorId:string,sessionId:string,input:{share:boolean;typing:boolean}){
 return transaction(async tx=>{
  const c=await scoped(tx,id,actorId)
  if(c.status!=='ACCEPTED')throw errors.forbidden('Accept this conversation before sharing activity.')
  const other=peer(c,actorId)
  await canContact(tx,actorId,other)
  const now=new Date()
  const session=await tx.session.findFirst({where:{id:sessionId,userId:actorId,revokedAt:null,expiresAt:{gt:now}},select:{id:true}})
  if(!session)throw errors.unauthorized()
  // Bound storage: remove expired signals for this conversation as it is used.
  await tx.directActivity.deleteMany({where:{conversationId:id,activeUntil:{lte:now}}})
  if(input.share){
   const window=activityWindow(now,input.typing)
   await tx.directActivity.upsert({where:{conversationId_sessionId:{conversationId:id,sessionId}},create:{conversationId:id,sessionId,...window},update:window})
  }else{
   await tx.directActivity.deleteMany({where:{conversationId:id,sessionId}})
  }
  const rows=await tx.directActivity.findMany({where:{conversationId:id,activeUntil:{gt:now},session:{userId:other,revokedAt:null,expiresAt:{gt:now},user:{status:'ACTIVE',deletedAt:null}}},select:{typingUntil:true}})
  return {active:rows.length>0,typing:rows.some(r=>r.typingUntil!==null&&r.typingUntil>now)}
 })
}

export async function reportDirectMessage(conversationId:string,actorId:string,messageId:string,input:{reason:DirectReportReason;details:string|null}){
 return transaction(async tx=>{
  await scoped(tx,conversationId,actorId)
  const message=await tx.directMessage.findFirst({where:{id:messageId,conversationId,senderId:{not:actorId},removedAt:null},select:{id:true}})
  if(!message)throw errors.notFound('This message cannot be reported.')
  // The reporter may report only a received message. The stable key also prevents
  // retries from creating duplicate moderation cases.
  const id=createHash('sha256').update(JSON.stringify(['DIRECT_MESSAGE',actorId,messageId])).digest('hex')
  await tx.moderationReport.createMany({data:[{id,reporterId:actorId,targetType:'DIRECT_MESSAGE',targetId:messageId,reason:input.reason,details:input.details}],skipDuplicates:true})
  return {reported:true}
 })
}

export async function setDirectSafety(id:string,actorId:string,kind:'block'|'mute',enabled:boolean){
 const result=await transaction(async tx=>{
  const c=await scoped(tx,id,actorId)
  const other=peer(c,actorId)
  if(kind==='block'){
   if(enabled){
    await tx.userBlock.upsert({where:{blockerId_blockedId:{blockerId:actorId,blockedId:other}},create:{blockerId:actorId,blockedId:other},update:{}})
    await tx.directActivity.deleteMany({where:{conversationId:id}})
   }else await tx.userBlock.deleteMany({where:{blockerId:actorId,blockedId:other}})
  }else{
   if(enabled)await tx.userMute.upsert({where:{muterId_mutedId:{muterId:actorId,mutedId:other}},create:{muterId:actorId,mutedId:other},update:{}})
   else await tx.userMute.deleteMany({where:{muterId:actorId,mutedId:other}})
  }
  return c
 })
 // No notification reveals who blocked or muted whom. Both clients merely refetch.
 await relay(result,null)
 return {ok:true}
}
