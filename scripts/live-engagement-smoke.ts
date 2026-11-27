import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes'||process.env.NODE_ENV==='production')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected database.')
const base='http://127.0.0.1:3000/api/v1'
function check(v:unknown,label:string){if(!v)throw new Error(label);console.log('PASS '+label)}
async function main(){
 const ids:string[]=[];let orgId:string|undefined
 const actor=async()=>{const user=await db.user.create({data:{email:randomUUID()+'@example.invalid',displayName:'Synthetic engagement user',passwordHash:'synthetic'}});ids.push(user.id);const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});return {id:user.id,cookie:'ievx_session='+token}}
 try{
  const host=await actor(),fan=await actor(),outsider=await actor(),pending=await actor(),analyst=await actor()
  const org=await db.organization.create({data:{ownerId:host.id,name:'Synthetic engagement org',slug:'engagement-'+randomUUID(),status:'ACTIVE'}});orgId=org.id
  await db.membership.createMany({data:[{orgId,userId:host.id,role:'OWNER',acceptedAt:new Date()},{orgId,userId:pending.id,role:'EVENT_MANAGER'},{orgId,userId:analyst.id,role:'ANALYST',acceptedAt:new Date()}]})
  const event=await db.event.create({data:{orgId,title:'Synthetic private engagement',slug:'engagement-'+randomUUID(),description:'CI only',categorySlug:'community',status:'LIVE',visibility:'INVITE_ONLY',mode:'VIRTUAL',startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),createdBy:host.id}})
  const ep='/events/'+event.id
  const call=async(path:string,who?:{cookie:string},body?:object)=>{const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(who?{Cookie:who.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),headers:res.headers}}
  await db.rsvp.create({data:{eventId:event.id,userId:fan.id,name:'Synthetic attendee',status:'APPROVED'}})
  for(const who of [undefined,outsider,pending]){check((await call(ep+'/polls',who)).status===404,'unauthorized private poll list denied');check((await call(ep+'/questions',who)).status===404,'unauthorized private Q&A denied')}
  const draft=await call(ep+'/polls',host,{question:'Choose an option',options:['First','Second']});check(draft.status===200,'organizer draft created');const p=draft.data.poll
  const draftTwo=await call(ep+'/polls',host,{question:'Another question',options:['Yes','No']});check(draftTwo.status===200,'second draft created');const p2=draftTwo.data.poll
  const fanList=await call(ep+'/polls',fan);check(fanList.status===200&&fanList.data.polls.length===0&&fanList.headers.get('cache-control')?.includes('no-store'),'attendee cannot see drafts and response is private')
  check((await call(ep+'/polls',analyst)).data.polls.length===0,'analyst cannot see organizer-only drafts')
  const open=await Promise.all([call('/polls/'+p.id+'/open',host,{}),call('/polls/'+p2.id+'/open',host,{})]);check(open.every(x=>[200,409].includes(x.status))&&open.some(x=>x.status===200),'concurrent poll transition has truthful results')
  const active=await db.livePoll.findMany({where:{eventId:event.id,status:'OPEN'},include:{options:true}});check(active.length===1,'exactly one poll open after concurrent requests');const poll=active[0]!
  const vote='/polls/'+poll.id+'/vote',payload={optionId:poll.options[0]!.id}
  check((await call(vote,outsider,payload)).status===404,'outsider cannot vote directly');check((await call(vote,pending,payload)).status===404,'pending membership cannot vote')
  const attempts=await Promise.all([call(vote,fan,payload),call(vote,fan,payload)]);check(attempts.filter(x=>x.status===200).length===1&&attempts.filter(x=>x.status===409).length===1,'exactly one concurrent vote counted')
  check(await db.livePollVote.count({where:{pollId:poll.id}})===1,'durable vote count matches')
  check((await call(ep+'/questions',outsider,{body:'Unauthorized private question'})).status===404,'outsider cannot ask')
  const question=await call(ep+'/questions',fan,{body:'An authorized question'});check(question.status===200,'approved attendee question accepted');const q=question.data.question.id
  check((await call('/questions/'+q+'/upvote',outsider,{})).status===404,'outsider cannot upvote')
  check((await call('/questions/'+q+'/hide',host,{})).status===200,'organizer can hide question')
  check((await call(ep+'/questions',fan)).data.questions.length===0,'hidden question unavailable to attendees')
  check((await call(ep+'/questions',host)).data.questions.some((x:{id:string;status:string})=>x.id===q&&x.status==='HIDDEN'),'organizer retains moderation record')
  await db.rsvp.updateMany({where:{eventId:event.id,userId:fan.id},data:{status:'DECLINED'}})
  check((await call(ep+'/polls',fan)).status===404&&(await call(ep+'/questions',fan)).status===404,'revoked attendee loses access')
  check((await call('/polls/'+poll.id+'/close',host,{})).status===200,'organizer closes poll')
  console.log('LIVE_ENGAGEMENT_INTEGRITY_PASS')
 }finally{if(orgId){await db.event.deleteMany({where:{orgId}});await db.organization.delete({where:{id:orgId}})}await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}})}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
