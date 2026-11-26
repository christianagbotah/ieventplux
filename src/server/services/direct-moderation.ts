import {Prisma} from '@prisma/client'
import {db} from '../../lib/db'
import {ApiError,errors} from '../api'
import {removedMessageBody} from '../direct-report-policy'
import {realtimeEmit} from './realtime'
import {attachmentMetadata,requireAttachmentKey} from './direct-attachments'
import {decryptAttachment,digestAttachment} from '../direct-attachment-policy'
type Actor={id:string;email:string}
async function scope(tx:Prisma.TransactionClient,id:string){
 const report=await tx.moderationReport.findFirst({where:{id,targetType:'DIRECT_MESSAGE',status:{in:['OPEN','REVIEWING']}}})
 if(!report||!report.reporterId)throw errors.notFound('Open message report not found.')
 const message=await tx.directMessage.findFirst({where:{id:report.targetId,senderId:{not:report.reporterId},conversation:{OR:[{participantLowId:report.reporterId},{participantHighId:report.reporterId}]}},include:{conversation:{select:{participantLowId:true,participantHighId:true}},sender:{select:{id:true,displayName:true}},attachment:{select:attachmentMetadata}}})
 if(!message)throw errors.notFound('Reported message is no longer available.')
 return {report,message}
}
async function safeTransaction<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>){
 try{return await db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
 catch(err){
  if(err instanceof ApiError)throw err
  if(err&&typeof err==='object'&&'code' in err&&String(err.code)==='P2034')throw errors.conflict('Report changed. Refresh and retry.')
  throw errors.unavailable('MODERATION_UNAVAILABLE','Message review is temporarily unavailable.')
 }
}
async function record(tx:Prisma.TransactionClient,actor:Actor,id:string,action:string){
 await tx.auditLog.create({data:{actorUserId:actor.id,actorLabel:actor.email.slice(0,120),action,entityType:'ModerationReport',entityId:id}})
}
export async function viewReportedMessage(id:string,actor:Actor){
 return safeTransaction(async tx=>{
  const {message}=await scope(tx,id)
  await record(tx,actor,id,'moderation.direct_message.view')
  return {message:{id:message.id,body:message.removedAt?removedMessageBody:message.body,createdAt:message.createdAt,removedAt:message.removedAt,sender:message.sender,attachment:message.removedAt?null:message.attachment}}
 })
}
export async function resolveReportedMessage(id:string,actor:Actor,action:string,note:string){
 const result=await safeTransaction(async tx=>{
  const {report,message}=await scope(tx,id)
  if(!['DISMISS','REVIEWING','REMOVE_CONTENT','SUSPEND_USER'].includes(action))throw errors.badRequest('Invalid moderation action.')
  const now=new Date()
  if(action==='REMOVE_CONTENT'&&!message.removedAt){
   await tx.directAttachment.deleteMany({where:{messageId:message.id}})
   await tx.directMessage.update({where:{id:message.id},data:{removedAt:now,body:removedMessageBody}})
  }
  if(action==='SUSPEND_USER'){
   // Never silently suspend a staff account through an ordinary message report.
   const changed=await tx.user.updateMany({where:{id:message.senderId,role:'USER',status:'ACTIVE',deletedAt:null},data:{status:'SUSPENDED'}})
   if(!changed.count)throw errors.conflict('Sender cannot be suspended through this report.')
   await tx.session.updateMany({where:{userId:message.senderId,revokedAt:null},data:{revokedAt:now}})
  }
  const status=action==='DISMISS'?'DISMISSED':action==='REVIEWING'?'REVIEWING':'ACTIONED'
  const changed=await tx.moderationReport.updateMany({where:{id:report.id,status:{in:['OPEN','REVIEWING']}},data:{status,reviewerId:actor.id,reviewedAt:now,resolutionNote:note||action}})
  if(!changed.count)throw errors.conflict('Report already resolved.')
  await record(tx,actor,id,'moderation.direct_message.'+action.toLowerCase())
  return {status,conversation:message.conversation}
 })
 if(action==='REMOVE_CONTENT'||action==='SUSPEND_USER')await Promise.all([
  realtimeEmit('user:'+result.conversation.participantLowId,'direct:changed',{}),
  realtimeEmit('user:'+result.conversation.participantHighId,'direct:changed',{}),
 ])
 return {status:result.status}
}

export async function downloadReportedAttachment(id:string,actor:Actor){
 return safeTransaction(async tx=>{
  const {message}=await scope(tx,id)
  if(message.removedAt)throw errors.notFound('Attachment unavailable.')
  const row=await tx.directAttachment.findUnique({where:{messageId:message.id}})
  if(!row)throw errors.notFound('Attachment unavailable.')
  const bytes=decryptAttachment(row.payload,requireAttachmentKey(),row.messageId)
  if(bytes.length!==row.size||digestAttachment(bytes)!==row.digest)throw new Error('Attachment integrity failed.')
  await record(tx,actor,id,'moderation.direct_message.attachment')
  return {filename:row.filename,mime:row.mime,size:row.size,bytes}
 })
}
