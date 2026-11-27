import {randomUUID} from 'node:crypto'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes'||process.env.NODE_ENV==='production')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const base='http://127.0.0.1:3000/api/v1/events'
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
async function main(){
 const org=await db.organization.findFirstOrThrow({where:{deletedAt:null},select:{id:true}})
 const marker='CI-discovery-'+randomUUID(),ids:string[]=[]
 const make=async(name:string,visibility:string,prices:{currency:string;priceMinor:number;active?:boolean}[],status='PUBLISHED')=>{
  const event=await db.event.create({data:{orgId:org.id,title:marker+' '+name,slug:marker.toLowerCase()+'-'+name,description:'Isolated synthetic discovery fixture',categorySlug:'community',visibility,status,startsAt:new Date(Date.now()+86400000),endsAt:new Date(Date.now()+90000000)}})
  ids.push(event.id)
  for(const [i,price] of prices.entries())await db.ticketType.create({data:{eventId:event.id,orgId:org.id,name:'Synthetic tier '+i,quota:100,...price}})
  return event
 }
 const list=async(extra:string)=>{const res=await fetch(base+'?q='+encodeURIComponent(marker)+'&'+extra);return {status:res.status,data:await res.json()}}
 try{
  const a=await make('lower','PUBLIC',[{currency:'GHS',priceMinor:1000},{currency:'USD',priceMinor:10}])
  const b=await make('higher','PUBLIC',[{currency:'GHS',priceMinor:2000},{currency:'GHS',priceMinor:3000},{currency:'GHS',priceMinor:1,active:false}])
  const c=await make('free','PUBLIC',[{currency:'GHS',priceMinor:0},{currency:'USD',priceMinor:100}])
  await make('foreign','PUBLIC',[{currency:'USD',priceMinor:1}])
  await make('private','INVITE_ONLY',[{currency:'GHS',priceMinor:0}])
  await make('unlisted','UNLISTED',[{currency:'GHS',priceMinor:0}])
  await make('draft','PUBLIC',[{currency:'GHS',priceMinor:0}],'DRAFT')
  const first=await list('sort=price&currency=GHS&pageSize=2&page=1')
  check(first.status===200&&first.data.total===3&&first.data.items.map((v:{id:string})=>v.id).join(',')===[c.id,a.id].join(','),'actual minimum GHS rank across public catalogue')
  const second=await list('sort=price&currency=GHS&pageSize=2&page=2')
  check(second.data.items.length===1&&second.data.items[0].id===b.id,'next page preserves rank and excludes inactive cheap tickets')
  const paid=await list('sort=price&currency=GHS&price=PAID')
  check(paid.data.total===2&&paid.data.items[0].id===a.id,'paid filter matches same currency and active tier')
  const usd=await list('sort=price&currency=USD')
  check(usd.data.total===3&&usd.data.items[1].id===a.id,'USD ranking does not compare cedi minor units')
  check((await list('sort=price')).status===400,'missing sort currency rejected')
  check((await list('from=invalid')).status===400,'invalid dates rejected')
  console.log('EVENT_DISCOVERY_SORT_SMOKE_PASS')
 }finally{await db.event.deleteMany({where:{id:{in:ids}}})}
}
main().catch(err=>{console.error(err instanceof Error?err.message:'Discovery smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
