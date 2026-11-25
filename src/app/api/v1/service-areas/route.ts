import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,rateLimit,errors} from '@/server/api'
import {GHANA_REGIONS} from '@/server/service-area-catalogue-policy'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'service-area-list',60,60000)
  const region=req.nextUrl.searchParams.get('region')||'',q=(req.nextUrl.searchParams.get('q')||'').trim()
  if((region&&!GHANA_REGIONS.some(r=>r===region))||q.length>100)throw errors.badRequest('Invalid community search.')
  const items=await db.serviceArea.findMany({where:{country:'GH',active:true,...(region?{region}:{}),...(q?{name:{contains:q,mode:'insensitive'}}:{})},select:{id:true,name:true,region:true,country:true},orderBy:[{region:'asc'},{name:'asc'},{id:'asc'}],take:100})
  return jsonOk({items,regions:GHANA_REGIONS,locationMode:'COMMUNITY_ANCHOR_ONLY'},{headers:{'Cache-Control':'no-store'}})
 })
}
