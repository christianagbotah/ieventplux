import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes'||process.env.NODE_ENV==='production')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const base='http://127.0.0.1:3000/api/v1/events'
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
async function main(){
 const marker='ci-series-'+randomUUID()
 const user=await db.user.create({data:{email:marker+'@example.invalid',displayName:'Synthetic series organizer',passwordHash:'synthetic'}})
 const orgIds:string[]=[]
 try{
  const token=randomBytes(32).toString('hex')
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
  const makeOrg=async(suffix:string)=>{
   const org=await db.organization.create({data:{ownerId:user.id,name:marker+' '+suffix,slug:marker+'-'+suffix,status:'ACTIVE'}})
   orgIds.push(org.id)
   return org
  }
  const own=await makeOrg('own'),other=await makeOrg('other')
  await db.membership.create({data:{orgId:own.id,userId:user.id,role:'OWNER',acceptedAt:new Date()}})
  const venue=await db.venue.create({data:{orgId:own.id,name:'Synthetic venue'}})
  const foreign=await db.venue.create({data:{orgId:other.id,name:'Foreign venue'}})
  const payload={orgId:own.id,title:'Synthetic recurring event',description:'Test only',startsAt:'2027-03-07T15:00:00Z',endsAt:'2027-03-07T16:00:00Z',timezone:'America/New_York',visibility:'INVITE_ONLY',repeatWeeks:2,venueId:venue.id}
  const call=async(body:object,id?:string)=>{
   const res=await fetch(base+(id?'/'+id:''),{method:id?'PATCH':'POST',headers:{Cookie:'ievx_session='+token,'Content-Type':'application/json'},body:JSON.stringify(body)})
   return {status:res.status,data:await res.json()}
  }
  check((await call({...payload,venueId:foreign.id})).status===400,'cross-organization venue denied')
  check((await call({...payload,repeatWeeks:27})).status===400,'invalid recurrence denied')
  check((await call({...payload,startsAt:'2027-03-07T07:30:00Z',endsAt:'2027-03-07T09:00:00Z'})).status===400,'DST gap denied before writes')
  check((await call({...payload,visibility:'PRIVTE'})).status===400,'invalid visibility fails closed')
  check(await db.event.count({where:{orgId:own.id}})===0&&await db.eventSeries.count({where:{orgId:own.id}})===0,'failed creation leaves no partial drafts or series')
  const created=await call(payload)
  check(created.status===200&&created.data.seriesId&&created.data.occurrencesCreated===2&&created.data.event.seriesId===created.data.seriesId,'series creation acknowledged with actual parent series link')
  const rows=await db.event.findMany({where:{orgId:own.id,seriesId:created.data.seriesId},orderBy:{startsAt:'asc'}})
  check(rows.length===3&&rows.every(row=>row.status==='DRAFT'&&row.visibility==='INVITE_ONLY'&&row.venueId===venue.id),'all occurrences are private unpublished drafts')
  check(rows[1]?.startsAt.toISOString()==='2027-03-14T14:00:00.000Z'&&rows[1]?.endsAt.toISOString()==='2027-03-14T15:00:00.000Z','weekly series preserves local clocks across DST')
  check((await call({venueId:foreign.id},rows[0].id)).status===400,'cross-organization venue edit denied')
  check((await call({startsAt:'2027-03-08T15:00:00Z'},rows[0].id)).status===400,'single-field schedule inversion denied')
  check((await call({title:''},rows[0].id)).status===400,'empty title edit denied')
  check((await call({title:'Updated synthetic event'},rows[0].id)).status===200,'authorized metadata edit accepted')
  const after=await db.event.findUniqueOrThrow({where:{id:rows[0].id}})
  check(after.venueId===venue.id&&after.startsAt.toISOString()===rows[0].startsAt.toISOString(),'rejected edits do not mutate venue or schedule')
  const apply=async(body:object)=>{
   const res=await fetch(base+'/'+rows[0].id+'/apply-to-series',{method:'POST',headers:{Cookie:'ievx_session='+token,'Content-Type':'application/json'},body:JSON.stringify(body)})
   return {status:res.status,data:await res.json()}
  }
  const source=await call({startsAt:'2027-03-07T17:00:00Z',endsAt:'2027-03-07T18:00:00Z',summary:'Synthetic revised summary'},rows[0].id)
  check(source.status===200,'source clock updated')
  await db.event.update({where:{id:rows[2].id},data:{status:'PUBLISHED'}})
  check((await apply({fields:['summary'],adoptTime:true})).status===409,'published target prevents entire bulk timing update')
  check((await db.event.findUniqueOrThrow({where:{id:rows[1].id}})).summary===rows[1].summary,'rejected bulk timing change does not apply metadata')
  await db.event.update({where:{id:rows[2].id},data:{status:'DRAFT'}})
  const bulk=await apply({fields:['summary'],adoptTime:true})
  check(bulk.status===200&&bulk.data.updated===2,'all future drafts updated together')
  const revised=await db.event.findUniqueOrThrow({where:{id:rows[1].id}})
  check(revised.summary==='Synthetic revised summary'&&revised.startsAt.toISOString()==='2027-03-14T16:00:00.000Z'&&revised.endsAt.toISOString()==='2027-03-14T17:00:00.000Z','bulk adopts correct DST local clocks')
  console.log('EVENT_SERIES_CREATE_SMOKE_PASS')
 }finally{
  await db.event.deleteMany({where:{orgId:{in:orgIds}}})
  await db.eventSeries.deleteMany({where:{orgId:{in:orgIds}}})
  await db.auditLog.deleteMany({where:{actorUserId:user.id}})
  await db.organization.deleteMany({where:{id:{in:orgIds}}})
  await db.user.delete({where:{id:user.id}})
 }
}
main().catch(err=>{console.error(err instanceof Error?err.message:'Series smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
