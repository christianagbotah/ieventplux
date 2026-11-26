/**
 * Real HTTP/Prisma transport acceptance against disposable GitHub CI only.
 * No staging accounts, commercial reservations, payments or dispatch.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'

const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid')
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||
 process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes'||
 !['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||
 url.pathname!=='/ieventplux'||!['postgresql:','postgres:'].includes(url.protocol)){
 throw new Error('Transport tests require the disposable CI database.')
}
const base='http://127.0.0.1:3000/api/v1'
function check(condition:unknown,label:string):asserts condition{
 if(!condition)throw new Error('TRANSPORT TEST FAILED: '+label)
 console.log('PASS '+label)
}
async function send(method:string,path:string,cookie?:string,body?:unknown){
 const r=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const data=await r.json().catch(()=>({}))
 return {status:r.status,data,headers:r.headers}
}
async function login(email:string){
 // The shared smoke stack deliberately retains the real login limiter.
 for(let attempt=0;attempt<3;attempt++){
  const r=await send('POST','/auth/login',undefined,{email,password:'Dev@12345'})
  if(r.status===429){
   const retry=Number(r.headers.get('retry-after')??'60')
   if(attempt===2||!Number.isFinite(retry)||retry>75)throw new Error('CI login rate limit did not clear')
   console.log('CI login limiter reached; respecting Retry-After.')
   await Bun.sleep(Math.max(1,retry+1)*1000)
   continue
  }
  check(r.status===200,'synthetic login '+email+' HTTP '+r.status)
  const cookie=(r.headers.getSetCookie?.()[0]??r.headers.get('set-cookie')??'').split(';')[0]
  check(cookie.startsWith('ievx_session='),'session cookie returned')
  return cookie
 }
 throw new Error('CI login retry exhausted')
}
const key=randomUUID()
const ids={provider:'ci-p-'+key,other:'ci-o-'+key,origin:'ci-a-'+key,destination:'ci-b-'+key,route:'ci-r-'+key,overlap:'ci-s-'+key,vehicle:'ci-v-'+key,foreignVehicle:'ci-f-'+key}
const day=86400000
const tomorrow=new Date(Math.floor(Date.now()/day)*day+day)
const date=tomorrow.toISOString().slice(0,10)
const path='/service-providers/'+ids.provider
try{
 const owner=await db.user.findUniqueOrThrow({where:{email:'pastor@lightworld.dev'}})
 const stranger=await db.user.findUniqueOrThrow({where:{email:'ama@example.dev'}})
 const a=await login(owner.email),b=await login(stranger.email)
 await db.serviceProviderProfile.createMany({data:[
  {id:ids.provider,ownerId:owner.id,category:'BUS_CHARTER',country:'GH',community:'CI synthetic',displayName:'CI Transport '+key,serviceDescription:'Synthetic provider for isolated CI only'},
  {id:ids.other,ownerId:stranger.id,category:'BUS_CHARTER',country:'GH',community:'CI synthetic',displayName:'CI Other '+key,serviceDescription:'Synthetic other provider for isolated CI only'},
 ]})
 await db.serviceArea.createMany({data:[
  {id:ids.origin,country:'GH',region:'CI',name:'Origin '+key,latitude:0,longitude:0,createdBy:owner.id},
  {id:ids.destination,country:'GH',region:'CI',name:'Destination '+key,latitude:0,longitude:0,createdBy:owner.id},
 ]})
 const routeData={providerId:ids.provider,originAreaId:ids.origin,destinationAreaId:ids.destination,operatingDays:[1,2,3,4,5,6,7],estimatedMinutes:120}
 await db.transportRouteDraft.createMany({data:[
  {...routeData,id:ids.route,label:'Morning route',labelKey:'morning',departureMinute:360},
  {...routeData,id:ids.overlap,label:'Overlap route',labelKey:'overlap',departureMinute:390},
 ]})
 await db.transportVehicle.createMany({data:[
  {id:ids.vehicle,providerId:ids.provider,label:'CI bus',labelKey:'ci-bus',vehicleClass:'MINIBUS',passengerSeats:20},
  {id:ids.foreignVehicle,providerId:ids.other,label:'Other bus',labelKey:'other-bus',vehicleClass:'MINIBUS',passengerSeats:20},
 ]})
 await db.transportDepartureDraft.createMany({data:Array.from({length:105},(_,i)=>{
  const departureAt=new Date(tomorrow.getTime()-(i+2)*day+360*60000)
  return {routeId:ids.route,vehicleId:ids.vehicle,departureAt,arrivalAt:new Date(departureAt.getTime()+120*60000),allocatedSeats:10,state:'CANCELLED'}
 })})
 const payload={routeId:ids.route,vehicleId:ids.vehicle,date,allocatedSeats:12}
 check((await send('GET',path+'/departures')).status===401,'anonymous cannot read inventory')
 check((await send('GET',path+'/departures',b)).status===404,'other owner cannot read inventory')
 check((await send('POST',path+'/departures',b,payload)).status===404,'other owner cannot allocate')
 check((await send('POST',path+'/departures',a,{...payload,vehicleId:ids.foreignVehicle})).status===404,'foreign vehicle cannot be allocated')
 check((await send('POST',path+'/departures',a,{...payload,allocatedSeats:21})).status===400,'declared seat limit enforced')
 const race=await Promise.all([
  send('POST',path+'/departures',a,payload),
  send('POST',path+'/departures',a,{...payload,routeId:ids.overlap}),
 ])
 check(race.filter(r=>r.status===201).length===1&&race.filter(r=>r.status===409).length===1,'concurrent overlapping allocation has exactly one winner')
 const winner=race.find(r=>r.status===201)!
 const id=winner.data.item.id as string
 const row=await db.transportDepartureDraft.findUniqueOrThrow({where:{id}})
 const replay=await send('POST',path+'/departures',a,{...payload,routeId:row.routeId})
 check(replay.status===200&&replay.data.replayed===true&&replay.data.item.id===id,'identical retry returns existing allocation')
 const list=await send('GET',path+'/departures',a)
 check(list.status===200&&list.data.items.length===101&&list.data.items[0].id===id,'upcoming allocation remains visible after 105 historical rows')
 check(list.data.bookingEnabled===false&&list.data.dispatchEnabled===false&&list.headers.get('cache-control')?.includes('no-store'),'private non-bookable inventory')
 check(new Set(list.data.items.map((r:{id:string})=>r.id)).size===101,'no duplicate rows in inventory')
 check((await send('PATCH',path+'/departures/'+id,b,{action:'CANCEL'})).status===404,'other owner cannot cancel')
 check((await send('PATCH',path+'/departures/'+id,a,{action:'CANCEL'})).status===200,'owner cancels')
 check((await send('PATCH',path+'/departures/'+id,a,{action:'CANCEL'})).status===200,'cancellation replay safe')
 const nextDate=new Date(tomorrow.getTime()+day).toISOString().slice(0,10)
 const next=await send('POST',path+'/departures',a,{...payload,date:nextDate})
 check(next.status===201,'allocate another day')
 const archive=await send('PATCH',path+'/transport-routes/'+ids.route,a,{action:'ARCHIVE'})
 check(archive.status===200,'owner archives route')
 check((await db.transportDepartureDraft.findUniqueOrThrow({where:{id:next.data.item.id}})).state==='CANCELLED','route archive cancels allocations atomically')
 const thirdDate=new Date(tomorrow.getTime()+2*day).toISOString().slice(0,10)
 const third=await send('POST',path+'/departures',a,{...payload,routeId:ids.overlap,date:thirdDate})
 check(third.status===201,'allocate on another active route')
 check((await send('PATCH',path+'/vehicles/'+ids.vehicle,a,{action:'ARCHIVE'})).status===200,'owner archives vehicle')
 check((await db.transportDepartureDraft.findUniqueOrThrow({where:{id:third.data.item.id}})).state==='CANCELLED','vehicle archive cancels allocations atomically')
 console.log('TRANSPORT_DEPARTURE_SMOKE_PASS')
}finally{
 await db.transportDepartureDraft.deleteMany({where:{routeId:{in:[ids.route,ids.overlap]}}})
 await db.transportRouteDraft.deleteMany({where:{id:{in:[ids.route,ids.overlap]}}})
 await db.transportVehicle.deleteMany({where:{id:{in:[ids.vehicle,ids.foreignVehicle]}}})
 await db.serviceProviderProfile.deleteMany({where:{id:{in:[ids.provider,ids.other]}}})
 await db.serviceArea.deleteMany({where:{id:{in:[ids.origin,ids.destination]}}})
 await db.$disconnect()
}
