import {randomBytes,createHash} from 'node:crypto'
import {db} from '../src/lib/db'
import {discoverPushDeliveries,processPushDeliveries,checkPushReceipts,prunePushLedger,createExpoPushTransport,type PushTransport} from '../src/server/services/push-delivery'
import type {SendResult,ReceiptResult} from '../src/server/push-delivery-policy'
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const key=()=>randomBytes(32).toString('hex')
const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
async function main(){
 check(createExpoPushTransport()===null,'live transport disabled in CI')
 const users:string[]=[]
 const make=async(push=true)=>{
  const user=await db.user.create({data:{email:key()+'@example.invalid',displayName:'Synthetic push recipient',passwordHash:'synthetic',notifPrefs:JSON.stringify({push})}})
  users.push(user.id)
  const session=await db.session.create({data:{userId:user.id,tokenHash:hash(key()),expiresAt:new Date(Date.now()+600000)}})
  const installation=await db.pushInstallation.create({data:{keyHash:hash(key()),sessionId:session.id,providerToken:'ExpoPushToken['+key()+']',platform:'ANDROID',activatedAt:new Date(Date.now()-30_000),leaseUntil:new Date(Date.now()+60_000)}})
  return {user,session,installation}
 }
 const notice=(userId:string,createdAt=new Date())=>db.notification.create({data:{userId,type:'SYSTEM',title:'Sensitive synthetic subject',body:'Sensitive synthetic body',link:'#/private',createdAt}})
 const get=(notificationId:string)=>db.pushDelivery.findFirstOrThrow({where:{notificationId}})
 const sends:string[]=[]
 const ttls:number[]=[]
 let sendResult:SendResult={kind:'accepted',ticketId:'synthetic-ticket'}
 let receipt:ReceiptResult={kind:'ok'}
 const transport:PushTransport={send:async (token,ttl)=>{sends.push(token);ttls.push(ttl);return sendResult},receipts:async ids=>Object.fromEntries(ids.map(id=>[id,receipt]))}
 try{
  const a=await make(),b=await make(false),c=await make(),d=await make(),e=await make(),f=await make(),g=await make()
  const n=await notice(a.user.id),old=await notice(a.user.id,new Date(Date.now()-60_000))
  const optout=await notice(b.user.id),read=await notice(c.user.id),revoked=await notice(d.user.id),rotated=await notice(e.user.id)
  const expired=await notice(f.user.id),unleased=await notice(g.user.id)
  await db.pushInstallation.update({where:{keyHash:g.installation.keyHash},data:{leaseUntil:null}})
  await Promise.all([discoverPushDeliveries(),discoverPushDeliveries()])
  check(await db.pushDelivery.count({where:{notificationId:unleased.id}})===0,'unleased device excluded at discovery')
  await db.pushInstallation.update({where:{keyHash:f.installation.keyHash},data:{leaseUntil:new Date(0)}})
  check(await db.pushDelivery.count({where:{notificationId:n.id}})===1,'concurrent discovery creates one delivery per installation')
  check(await db.pushDelivery.count({where:{notificationId:old.id}})===0,'pre-registration notification is never replayed')
  await db.notification.update({where:{id:read.id},data:{readAt:new Date()}})
  await db.session.update({where:{id:d.session.id},data:{revokedAt:new Date()}})
  await db.pushInstallation.update({where:{keyHash:e.installation.keyHash},data:{activatedAt:new Date(Date.now()+1000),providerToken:'ExpoPushToken['+key()+']'}})
  await Promise.all([processPushDeliveries(transport),processPushDeliveries(transport)])
  check(sends.length===1&&sends[0]===a.installation.providerToken,'only eligible account gets one provider submission')
  check(ttls[0]!>0&&ttls[0]!<=60,'provider TTL bounded by installation lease')
  for(const blocked of [optout,read,revoked,rotated,expired])check((await get(blocked.id)).status==='SUPPRESSED','ineligible delivery suppressed')
  let row=await get(n.id)
  check(row.status==='ACCEPTED'&&row.providerTicketId==='synthetic-ticket','ticket acceptance not treated as receipt')
  await db.pushDelivery.update({where:{id:row.id},data:{nextAttemptAt:new Date(0)}})
  await checkPushReceipts(transport)
  check((await get(n.id)).status==='RECEIPT_OK','separate provider receipt recorded')
  sendResult={kind:'unknown',code:'TRANSPORT_AMBIGUOUS'}
  const unknown=await notice(a.user.id)
  await discoverPushDeliveries();await processPushDeliveries(transport);await processPushDeliveries(transport)
  check((await get(unknown.id)).status==='UNKNOWN'&&(await get(unknown.id)).attempts===1,'ambiguous send is not blindly repeated')
  sendResult={kind:'retry',code:'RATE_LIMIT'}
  const retry=await notice(a.user.id)
  await discoverPushDeliveries();await processPushDeliveries(transport)
  check((await get(retry.id)).status==='QUEUED','definite rate-limit rejection is retryable')
  for(let i=0;i<2;i++){
   row=await get(retry.id);await db.pushDelivery.update({where:{id:row.id},data:{nextAttemptAt:new Date(0)}});await processPushDeliveries(transport)
  }
  check((await get(retry.id)).status==='FAILED'&&(await get(retry.id)).attempts===3,'retry capped at three attempts')
  sendResult={kind:'accepted',ticketId:'synthetic-stale-ticket'}
  const stale=await notice(a.user.id)
  await discoverPushDeliveries();await processPushDeliveries(transport)
  row=await get(stale.id)
  await db.pushDelivery.update({where:{id:row.id},data:{nextAttemptAt:new Date(0)}})
  await db.pushInstallation.update({where:{keyHash:a.installation.keyHash},data:{activatedAt:new Date(Date.now()+1000),providerToken:'ExpoPushToken['+key()+']'}})
  receipt={kind:'failed',code:'DeviceNotRegistered'}
  await checkPushReceipts(transport)
  check((await get(stale.id)).status==='FAILED','invalid-device receipt recorded')
  check(!(await db.pushInstallation.findUniqueOrThrow({where:{keyHash:a.installation.keyHash}})).revokedAt,'stale receipt cannot invalidate rotated installation')
  sendResult={kind:'failed',code:'DeviceNotRegistered'}
  const invalid=await notice(c.user.id)
  await discoverPushDeliveries();await processPushDeliveries(transport)
  check(!!(await db.pushInstallation.findUniqueOrThrow({where:{keyHash:c.installation.keyHash}})).revokedAt,'current invalid token revoked')
  check((await get(invalid.id)).status==='FAILED','invalid device failure persisted')
  const oldDate=new Date(Date.now()-8*86400000)
  await db.notification.update({where:{id:n.id},data:{createdAt:oldDate}})
  await db.pushDelivery.update({where:{id:(await get(n.id)).id},data:{updatedAt:oldDate}})
  check(await prunePushLedger()>=1,'old terminal ledger rows pruned')
  check(await db.pushDelivery.count({where:{notificationId:n.id}})===0,'old receipt record removed')
  await discoverPushDeliveries()
  check(await db.pushDelivery.count({where:{notificationId:n.id}})===0,'pruned record cannot rediscover expired notification')
  check((await get(invalid.id)).status==='FAILED','recent failure retained')
  console.log('PUSH_DELIVERY_SMOKE_PASS')
 }finally{await db.user.deleteMany({where:{id:{in:users}}})}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Push delivery smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
