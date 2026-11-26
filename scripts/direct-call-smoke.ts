import {randomBytes,createHash} from 'node:crypto'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const key=()=>randomBytes(24).toString('hex')
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
const users:string[]=[]
type Actor={id:string;cookie:string;ip:string}
let nextIp=100
async function device(id:string){
 const token=key()
 await db.session.create({data:{userId:id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
 return {id,cookie:'ievx_session='+token,ip:'192.0.2.'+(nextIp++)}
}
async function make(){
 const u=await db.user.create({data:{email:key()+'@example.invalid',displayName:'Synthetic call contact',passwordHash:'synthetic'}})
 users.push(u.id);return device(u.id)
}
async function api(actor:Actor|null,route:string,body?:object){
 const res=await fetch('http://127.0.0.1:3000/api/v1/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-forwarded-for':actor?.ip??'192.0.2.98',...(actor?{Cookie:actor.cookie}:{})},body:body?JSON.stringify({expectedUserId:actor?.id,...body}):undefined})
 return {status:res.status,data:await res.json(),headers:res.headers}
}
async function conversation(a:Actor,b:Actor,accept=true){
 const r=await api(a,'direct-messages',{action:'request',userId:b.id})
 const id=r.data.conversation.id
 if(accept)await api(b,'direct-messages',{action:'accept',id})
 return id
}
async function main(){
 try{
  const a=await make(),b=await make(),c=await make(),d=await make(),b2=await device(b.id),a2=await device(a.id)
  const ab=await conversation(a,b),bc=await conversation(b,c),ad=await conversation(a,d,false)
  const start=(actor:Actor,conversationId:string,kind='VOICE',clientKey=key())=>api(actor,'direct-calls',{action:'start',conversationId,kind,clientKey})
  const act=(actor:Actor,id:string,action:string)=>api(actor,'direct-calls',{action,id})
  const list=(actor:Actor,conversationId?:string)=>api(actor,'direct-calls?expectedUserId='+actor.id+(conversationId?'&conversationId='+conversationId:''))
  check((await api(null,'direct-calls')).status===401,'anonymous call access denied')
  check((await start(a,ad)).status===403,'pending conversation cannot call')
  check((await start(c,ab)).status===404,'outsider cannot start private call')
  const clientKey=key(),first=await start(a,ab,'VOICE',clientKey)
  check(first.status===200&&first.data.call.status==='RINGING'&&first.data.call.mediaConnected===false,'durable ringing invitation, not media connected')
  const id=first.data.call.id
  check((await start(a,ab,'VOICE',clientKey)).data.replayed===true,'same call key deduplicated')
  check(await db.notification.count({where:{userId:b.id,type:'DIRECT_CALL_INVITE'}})===1,'one durable incoming alert')
  check((await start(c,bc)).status===409,'recipient cannot receive overlapping call invitations')
  check((await list(b)).data.items[0].id===id,'recipient sees incoming invitation')
  check((await list(c)).data.items.length===0,'outsider cannot list incoming calls')
  check((await list(c,ab)).status===404,'outsider cannot list call history')
  check((await act(c,id,'accept')).status===404,'outsider cannot accept')
  check((await act(a,id,'accept')).status===403,'caller cannot accept own invitation')
  check((await act(a2,id,'cancel')).status===403,'other caller device cannot cancel')
  const accepted=await act(b,id,'accept')
  check(accepted.data.call.status==='ACCEPTED'&&accepted.data.call.thisDevice&&accepted.data.call.mediaConnected===false,'one recipient device accepts invitation')
  check((await act(b2,id,'accept')).status===403,'other recipient device cannot accept same call')
  check((await act(b2,id,'end')).status===403,'other recipient device cannot end accepted call')
  check((await act(b,id,'end')).data.call.status==='ENDED','accepted device ends invitation')
  check(await db.directCallSlot.count({where:{callId:id}})===0,'ending frees both participant slots')
  const declined=(await start(a,ab,'VIDEO')).data.call.id
  check((await act(b,declined,'decline')).data.call.status==='DECLINED','recipient declines call')
  const cancelled=(await start(a,ab)).data.call.id
  check((await act(a,cancelled,'cancel')).data.call.status==='CANCELLED','caller cancels call')
  const missed=(await start(a,ab)).data.call.id
  await db.directCall.update({where:{id:missed},data:{createdAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)}})
  check((await act(b,missed,'accept')).data.call.status==='MISSED','expired ring cannot be accepted')
  check((await list(b,ab)).data.items.some((row:{id:string;status:string})=>row.id===missed&&row.status==='MISSED'),'missed invitation visible in history')
  check(await db.notification.count({where:{userId:b.id,type:'DIRECT_CALL_MISSED'}})===1,'missed call alert exactly once')
  const workerMissed=(await start(a,ab)).data.call.id
  await db.directCall.update({where:{id:workerMissed},data:{createdAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)}})
  const {sweepDirectCalls}=await import('../src/server/services/direct-calls')
  check(await sweepDirectCalls()>=1,'periodic sweep expires unanswered calls without recipient polling')
  check((await db.directCall.findUniqueOrThrow({where:{id:workerMissed}})).status==='MISSED','worker records missed invitation')
  check(await db.directCallSlot.count({where:{callId:workerMissed}})===0,'worker releases expired slots')
  await sweepDirectCalls()
  check(await db.notification.count({where:{userId:b.id,type:'DIRECT_CALL_MISSED'}})===2,'worker retries do not duplicate missed alert')
  const revoked=(await start(a2,ab)).data.call.id
  const revokedSession=(await db.directCall.findUniqueOrThrow({where:{id:revoked}})).callerSessionId
  await db.session.update({where:{id:revokedSession},data:{revokedAt:new Date()}})
  await sweepDirectCalls()
  check((await db.directCall.findUniqueOrThrow({where:{id:revoked}})).status==='CANCELLED','revoked caller session cancels ringing')
  const blocked=(await start(a,ab)).data.call.id
  await act(b,blocked,'accept')
  await api(b,'direct-messages',{action:'safety',id:ab,kind:'block',enabled:true})
  await sweepDirectCalls()
  check((await db.directCall.findUniqueOrThrow({where:{id:blocked}})).status==='ENDED','block terminates accepted invitation')
  check(await db.directCallSlot.count({where:{callId:blocked}})===0,'block releases active call slots')
  check((await start(a,ab)).status===403,'blocked contact cannot call')
  console.log('DIRECT_CALL_INVITATION_SMOKE_PASS')
 }finally{await db.user.deleteMany({where:{id:{in:users}}})}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Call invitation smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
