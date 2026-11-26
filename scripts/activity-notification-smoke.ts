import { randomBytes, createHash } from 'node:crypto'
import { db } from '../src/lib/db'
if (process.env.NODE_ENV === 'production' || process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes') throw new Error('Isolated development DB required.')
const base = 'http://localhost:3000/api/v1'
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); console.log('PASS ' + message) }
async function session(userId: string) {
 const token = randomBytes(32).toString('base64url')
 await db.session.create({data:{userId,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
 return 'ievx_session='+token
}
async function call(path: string, cookie: string, body?: object) {
 const response = await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','x-forwarded-for':'192.0.2.70'},body:body?JSON.stringify(body):undefined})
 return {response,data:await response.json()}
}
async function main() {
 const key=randomBytes(8).toString('hex')
 const make=(name:string)=>db.user.create({data:{email:name+'-'+key+'@example.invalid',displayName:name,passwordHash:'synthetic-no-login'}})
 const [actor,target,other]=await Promise.all([make('Follower'),make('Recipient'),make('Unrelated')])
 const [a,b,c]=await Promise.all([session(actor.id),session(target.id),session(other.id)])
 const follow=()=>call('/social/follow',a,{userId:target.id})
 const results=await Promise.all([follow(),follow(),follow()])
 assert(results.every(r=>r.response.ok),'concurrent follow requests succeed')
 const inbox=await call('/notifications',b)
 assert(inbox.data.unread===1&&inbox.data.items.length===1&&inbox.data.items[0].type==='FOLLOW','exactly one durable follower alert')
 assert((inbox.response.headers.get('cache-control')??'').includes('no-store'),'notification history is private no-store')
 const id=inbox.data.items[0].id
 assert((await call('/notifications',c)).data.items.length===0,'unrelated user cannot see follower alert')
 await call('/notifications',c,{id})
 assert((await call('/notifications',b)).data.unread===1,'unrelated user cannot mark recipient alert read')
 await call('/notifications',b,{id})
 assert((await call('/notifications',b)).data.unread===0,'recipient read status persists')
 await call('/social/unfollow',a,{userId:target.id})
 await follow()
 assert((await call('/notifications',b)).data.items.length===1,'immediate refollow does not spam recipient')
 await db.userMute.create({data:{muterId:target.id,mutedId:other.id}})
 assert((await call('/social/follow',c,{userId:target.id})).response.ok,'muted account can follow')
 assert((await call('/notifications',b)).data.items.length===1,'muted sender cannot generate follow alert')
 const org=await db.organization.findUniqueOrThrow({where:{slug:'lightworld-chapel'}})
 const ownerCookie=await session(org.ownerId)
 const start=new Date(Date.now()+86400000)
 const event=await db.event.create({data:{orgId:org.id,title:'Activity smoke '+key,slug:'activity-smoke-'+key,description:'Synthetic',categorySlug:'community',status:'PUBLISHED',visibility:'PUBLIC',startsAt:start,endsAt:new Date(+start+3600000)}})
 const ticket=await db.ticketType.create({data:{orgId:org.id,eventId:event.id,name:'Free RSVP',quota:2}})
 const result=await call('/orders',a,{eventId:event.id,items:[{ticketTypeId:ticket.id,qty:1}]})
 assert(result.response.ok,'synthetic ticket order created')
 const alert=await db.notification.findFirst({where:{userId:org.ownerId,type:'ORDER_CREATED',body:{contains:event.title}}})
 assert(alert&&alert.link?.includes(event.id),'organizer receives reservation alert with event destination')
 assert((await call('/notifications',ownerCookie)).data.items.some((n:{id:string})=>n.id===alert?.id),'organizer can retrieve order alert')
 assert(!(await call('/notifications',c)).data.items.some((n:{id:string})=>n.id===alert?.id),'outsider cannot retrieve reservation alert')
 // Same timestamp forces the secondary ID ordering; a new alert must not shift older pages.
 const stamp=new Date(Date.now()+60000)
 await db.notification.createMany({data:Array.from({length:25},(_,i)=>({id:'page-'+key+'-'+String(i).padStart(2,'0'),userId:target.id,type:'SYSTEM',title:'Synthetic history',body:'History',createdAt:stamp}))})
 const first=await call('/notifications?pageSize=20',b)
 assert(first.data.items.length===20&&typeof first.data.nextCursor==='string','history exposes a private next cursor')
 await db.notification.create({data:{userId:target.id,type:'SYSTEM',title:'Newest synthetic alert',body:'History',createdAt:new Date(+stamp+1000)}})
 const older=await call('/notifications?pageSize=20&before='+encodeURIComponent(first.data.nextCursor),b)
 assert(older.response.ok&&older.data.items.length===6&&!older.data.items.some((n:{id:string})=>first.data.items.some((x:{id:string})=>x.id===n.id)),'new alert does not shift the older cursor page')
 assert((await call('/notifications?before='+encodeURIComponent(first.data.nextCursor),c)).response.status===400,'another account cannot use private history cursor')
 assert((await call('/notifications?page=1.5',b)).response.status===400,'invalid fractional page rejected')
 console.log('ACTIVITY_NOTIFICATION_SMOKE_PASS')
}
main().finally(()=>db.$disconnect()).catch(err=>{console.error(err);process.exitCode=1})
