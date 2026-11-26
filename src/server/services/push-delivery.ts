import {db} from '../../lib/db'
import {PUSH_TTL_MS, RECEIPT_DELAY_MS, RECEIPT_DEADLINE_MS, MAX_PUSH_ATTEMPTS, pushTransportConfigured, optedIn, genericEnvelope, classifyTicket, classifyReceipt, type SendResult, type ReceiptResult} from '../push-delivery-policy'

export interface PushTransport {
 send(token:string):Promise<SendResult>
 receipts(ids:string[]):Promise<Record<string,ReceiptResult>>
}
export function createExpoPushTransport():PushTransport|null{
 if(!pushTransportConfigured(process.env))return null
 const headers={'Content-Type':'application/json','Authorization':'Bearer '+process.env.EXPO_PUSH_ACCESS_TOKEN!.trim()}
 const endpoint='https://exp.host/--/api/v2/push/'
 return {
  async send(token){
   try{
    const res=await fetch(endpoint+'send',{method:'POST',headers,body:JSON.stringify([genericEnvelope(token)]),signal:AbortSignal.timeout(7000),redirect:'error'})
    const body=await res.json().catch(()=>null)
    return classifyTicket(res.status,body)
   }catch{return {kind:'unknown',code:'TRANSPORT_AMBIGUOUS'}}
  },
  async receipts(ids){
   try{
    const res=await fetch(endpoint+'getReceipts',{method:'POST',headers,body:JSON.stringify({ids}),signal:AbortSignal.timeout(7000),redirect:'error'})
    if(!res.ok)return {}
    const body=await res.json() as {data?:Record<string,unknown>}
    return Object.fromEntries(ids.map(id=>[id,classifyReceipt(body.data?.[id])]))
   }catch{return {}}
  },
 }
}

type Candidate={notificationId:string;installationKeyHash:string;sessionId:string;activationAt:Date}
export async function discoverPushDeliveries(now=new Date()){
 const cutoff=new Date(+now-PUSH_TTL_MS)
 // Recover even notices written by direct business transactions or a crashed
 // web process. Indexed, bounded, no old notification replay.
 const rows=await db.$queryRaw<Candidate[]>`
 SELECT n.id AS "notificationId", i."keyHash" AS "installationKeyHash",
        s.id AS "sessionId", i."activatedAt" AS "activationAt"
 FROM "Notification" n
 JOIN "Session" s ON s."userId"=n."userId"
 JOIN "User" u ON u.id=s."userId"
 JOIN "PushInstallation" i ON i."sessionId"=s.id
 WHERE n."createdAt">=${cutoff} AND n."createdAt"<=${now}
 AND n."readAt" IS NULL AND n."createdAt">=i."activatedAt"
 AND i."revokedAt" IS NULL AND s."revokedAt" IS NULL
 AND s."expiresAt">${now} AND u.status='ACTIVE' AND u."deletedAt" IS NULL
 AND NOT EXISTS(SELECT 1 FROM "PushDelivery" d WHERE d."notificationId"=n.id AND d."installationKeyHash"=i."keyHash")
 ORDER BY n."createdAt",n.id,i."keyHash" LIMIT 100`
 if(!rows.length)return 0
 return (await db.pushDelivery.createMany({data:rows,skipDuplicates:true})).count
}
async function invalidateDevice(row:{installationKeyHash:string;sessionId:string;activationAt:Date}){
 // A delayed receipt from an earlier token/session must never revoke a new binding.
 await db.pushInstallation.updateMany({where:{keyHash:row.installationKeyHash,sessionId:row.sessionId,activatedAt:row.activationAt,revokedAt:null},data:{revokedAt:new Date()}})
}
export async function processPushDeliveries(transport:PushTransport,now=new Date()){
 const cutoff=new Date(+now-PUSH_TTL_MS)
 // Never retry a crashed in-flight send whose provider acceptance is unknown.
 await db.pushDelivery.updateMany({where:{status:'SENDING',updatedAt:{lt:new Date(+now-120_000)}},data:{status:'UNKNOWN',failureCode:'INTERRUPTED_SEND'}})
 await db.pushDelivery.updateMany({where:{status:'QUEUED',notification:{createdAt:{lt:cutoff}}},data:{status:'SUPPRESSED',failureCode:'EXPIRED'}})
 const pending=await db.pushDelivery.findMany({where:{status:'QUEUED',nextAttemptAt:{lte:now}},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:10,select:{id:true}})
 for(const {id} of pending){
  const claimed=await db.pushDelivery.updateMany({where:{id,status:'QUEUED',attempts:{lt:MAX_PUSH_ATTEMPTS}},data:{status:'SENDING',attempts:{increment:1}}})
  if(!claimed.count)continue
  const row=await db.pushDelivery.findUnique({where:{id},include:{notification:true,installation:{include:{session:{include:{user:{select:{id:true,status:true,deletedAt:true,notifPrefs:true}}}}}}}})
  if(!row)continue
  const i=row.installation,s=i.session,n=row.notification
  const checkTime=new Date()
  const eligible=i.revokedAt===null&&s.revokedAt===null&&s.expiresAt>checkTime&&s.id===row.sessionId&&+i.activatedAt===+row.activationAt&&s.userId===n.userId&&s.user.status==='ACTIVE'&&!s.user.deletedAt&&optedIn(s.user.notifPrefs)&&n.readAt===null&&n.createdAt>=i.activatedAt&&+n.createdAt>=+checkTime-PUSH_TTL_MS
  if(!eligible){
   await db.pushDelivery.updateMany({where:{id,status:'SENDING'},data:{status:'SUPPRESSED',failureCode:'INELIGIBLE'}});continue
  }
  // Transport handles its own timeout and never logs raw tokens or responses.
  let result:SendResult
  try{result=await transport.send(i.providerToken)}catch{result={kind:'unknown',code:'TRANSPORT_AMBIGUOUS'}}
  if(result.kind==='accepted'){
   await db.pushDelivery.updateMany({where:{id,status:'SENDING'},data:{status:'ACCEPTED',providerTicketId:result.ticketId,nextAttemptAt:new Date(Date.now()+RECEIPT_DELAY_MS),failureCode:null}})
  }else{
   const retry=result.kind==='retry'&&row.attempts<MAX_PUSH_ATTEMPTS
   await db.pushDelivery.updateMany({where:{id,status:'SENDING'},data:{status:retry?'QUEUED':result.kind==='unknown'?'UNKNOWN':'FAILED',failureCode:result.code,...(retry?{nextAttemptAt:new Date(Date.now()+15_000*2**row.attempts)}:{})}})
   if(result.code==='DeviceNotRegistered')await invalidateDevice(row)
  }
 }
 return pending.length
}
export async function checkPushReceipts(transport:PushTransport,now=new Date()){
 await db.pushDelivery.updateMany({where:{status:'ACCEPTED',createdAt:{lt:new Date(+now-RECEIPT_DEADLINE_MS)}},data:{status:'UNKNOWN',failureCode:'RECEIPT_EXPIRED'}})
 const rows=await db.pushDelivery.findMany({where:{status:'ACCEPTED',nextAttemptAt:{lte:now},providerTicketId:{not:null}},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:50})
 const ids=rows.flatMap(row=>row.providerTicketId?[row.providerTicketId]:[])
 if(!ids.length)return 0
 const results=await transport.receipts(ids)
 for(const row of rows){
  const receipt:ReceiptResult=results[row.providerTicketId!]??{kind:'pending'}
  await db.pushDelivery.updateMany({where:{id:row.id,status:'ACCEPTED'},data:receipt.kind==='ok'?{status:'RECEIPT_OK',failureCode:null}:receipt.kind==='failed'?{status:'FAILED',failureCode:receipt.code}:{nextAttemptAt:new Date(+now+RECEIPT_DELAY_MS)}})
  if(receipt.kind==='failed'&&receipt.code==='DeviceNotRegistered')await invalidateDevice(row)
 }
 return rows.length
}

export async function runPushDeliveryTick(){
 const transport=createExpoPushTransport()
 if(!transport)return
 await discoverPushDeliveries()
 await processPushDeliveries(transport)
 await checkPushReceipts(transport)
}
