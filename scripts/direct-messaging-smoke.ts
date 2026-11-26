import {randomBytes,createHash} from 'node:crypto'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const key=()=>randomBytes(24).toString('hex')
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
const users:string[]=[]
async function make(){
 const user=await db.user.create({data:{email:key()+'@example.invalid',displayName:'Synthetic chat contact',passwordHash:'synthetic'}})
 users.push(user.id)
 const token=key()
 await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
 return {id:user.id,cookie:'ievx_session='+token}
}
async function call(actor:{id:string;cookie:string}|null,path='',body?:object){
 const res=await fetch('http://127.0.0.1:3000/api/v1/direct-messages'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-forwarded-for':'192.0.2.95',...(actor?{Cookie:actor.cookie}:{})},body:body?JSON.stringify({expectedUserId:actor?.id,...body}):undefined})
 return {status:res.status,body:await res.json(),headers:res.headers}
}
async function main(){
 try{
  const a=await make(),b=await make(),c=await make(),d=await make()
  check((await call(null)).status===401,'anonymous history denied')
  check((await call(a,'',{action:'request',userId:a.id})).status===400,'self request denied')
  check((await call(a,'',{action:'request',userId:b.id,expectedUserId:c.id})).status===409,'stale account mutation denied')
  await db.follow.create({data:{followerId:a.id,userId:b.id}})
  const contacts=await call(a,'?contacts=1')
  check(contacts.body.items.length===1&&contacts.body.items[0].id===b.id&&!('email' in contacts.body.items[0]),'contact directory only exposes existing social connections and public fields')
  check((await call(c,'?contacts=1')).body.items.length===0,'unconnected accounts cannot browse directory')
  const request=await call(a,'',{action:'request',userId:b.id})
  check(request.status===200&&request.body.conversation.status==='PENDING','private contact request persisted')
  const id=request.body.conversation.id
  check((await call(b,'',{action:'request',userId:a.id})).body.conversation.id===id,'reverse request does not create second conversation')
  check((await db.notification.count({where:{userId:b.id,type:'DIRECT_REQUEST'}}))===1,'request notification deduplicated')
  check((await call(c,'?id='+id)).status===404,'nonparticipant cannot read conversation')
  check((await call(c,'')).body.items.length===0,'nonparticipant cannot list conversation')
  check((await call(a,'',{action:'accept',id})).status===403,'requester cannot accept own request')
  check((await call(a,'',{action:'send',id,clientKey:key(),body:'before acceptance'})).status===403,'pending request cannot send messages')
  const signal=(actor:typeof a,share=true,typing=false)=>call(actor,'',{action:'activity',id,share,typing})
  check((await signal(a)).status===403,'pending request cannot share activity')
  check((await signal(c)).status===404,'outsider cannot publish or read activity')
  check((await call(b,'',{action:'accept',id})).status===200,'recipient accepts conversation')
  check((await signal(a,true,true)).status===200,'accepted contact shares a bounded typing signal')
  const activity=await signal(b,false)
  check(activity.body.active===true&&activity.body.typing===true&&Object.keys(activity.body).length===2,'peer sees only current activity booleans')
  await db.directActivity.updateMany({where:{conversationId:id},data:{typingUntil:new Date(0)}})
  check((await signal(b,false)).body.typing===false,'typing expires')
  await signal(a,false)
  check((await signal(b,false)).body.active===false,'turning off sharing removes signal')
  await signal(a)
  await db.directActivity.updateMany({where:{conversationId:id},data:{activeUntil:new Date(0)}})
  check((await signal(b,false)).body.active===false,'expired activity is not exposed')
  const clientKey=key(),body='Private synthetic message'
  const sent=await call(a,'',{action:'send',id,clientKey,body})
  check(sent.status===200&&!sent.body.replayed,'message persisted')
  const messageId=sent.body.message.id
  check((await call(a,'',{action:'send',id,clientKey,body})).body.replayed===true,'retry returns original message')
  check((await call(a,'',{action:'send',id,clientKey,body:'different'})).status===409,'changed content cannot reuse client key')
  check((await db.directMessage.count({where:{conversationId:id}}))===1,'one stored message')
  const alerts=await db.notification.findMany({where:{userId:b.id,type:'DIRECT_MESSAGE'}})
  check(alerts.length===1&&!JSON.stringify(alerts).includes(body),'generic durable recipient notification')
  const history=await call(b,'?id='+id)
  check(history.body.items[0].body===body&&history.headers.get('cache-control')?.includes('no-store'),'recipient sees private message')
  check((await call(b)).body.items[0].unread===1,'unread count persisted')
  check((await call(c,'',{action:'read',id,throughId:messageId})).status===404,'outsider cannot mark read')
  check((await call(a,'',{action:'read',id,throughId:messageId})).body.marked===0,'sender cannot forge recipient receipt')
  check((await call(b,'',{action:'read',id,throughId:messageId})).body.marked===1,'recipient read receipt persisted')
  check(!!(await call(a,'?id='+id)).body.items[0].readAt,'sender sees genuine read receipt')
  await db.userMute.create({data:{muterId:b.id,mutedId:a.id}})
  check((await call(a,'',{action:'send',id,clientKey:key(),body:'muted contact'})).status===200,'mute preserves conversation')
  check(await db.notification.count({where:{userId:b.id,type:'DIRECT_MESSAGE'}})===1,'mute suppresses alert')
  await db.userBlock.create({data:{blockerId:b.id,blockedId:a.id}})
  check((await call(a,'',{action:'send',id,clientKey:key(),body:'blocked'})).status===403,'block stops new messages')
  check((await signal(a)).status===403,'blocked participants cannot exchange activity')
  check(!(await call(a,'?id='+id)).body.conversation.canSend,'blocked history indicates no sending')
  check((await call(a,'?contacts=1')).body.items.length===0,'blocked contact removed from directory')
  const decline=(await call(a,'',{action:'request',userId:d.id})).body.conversation.id
  check((await call(d,'',{action:'decline',id:decline})).status===200,'recipient declines contact')
  check((await call(a,'',{action:'request',userId:d.id})).body.conversation.status==='DECLINED','decline cannot be bypassed by repeated request')
  check((await call(b,'?id='+id+'&before=unrelated')).status===400,'foreign history cursor denied')
  console.log('DIRECT_MESSAGING_SMOKE_PASS')
 }finally{await db.user.deleteMany({where:{id:{in:users}}})}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Messaging smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
