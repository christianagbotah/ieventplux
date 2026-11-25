import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,rateLimit,errors} from '@/server/api'
import {SERVICE_CATEGORIES,publicProvider} from '@/server/service-directory-policy'
import {discoveryRecord} from '@/server/service-provider-lifecycle'
export async function GET(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'provider-discovery',60,60000)
  const q=req.nextUrl.searchParams
  const category=q.get('category')??'',community=(q.get('community')??'').trim(),country=q.get('country')??'GH'
  if(country!=='GH'||(category&&!SERVICE_CATEGORIES.some(c=>c.id===category))||community.length>100)throw errors.badRequest('Unsupported search.')
  const now=new Date()
  // Fetch only eligible public records; the policy applies an additional explicit
  // public projection and time-bound availability check to every record.
  const rows=await db.serviceProviderProfile.findMany({where:{country,category:category||{in:SERVICE_CATEGORIES.filter(c=>!c.regulated).map(c=>c.id)},published:true,reviewStatus:'APPROVED',jurisdictionApproved:true,owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}},...(community?{community:{contains:community,mode:'insensitive'}}:{})},orderBy:[{lastConfirmedAt:{sort:'desc',nulls:'last'}},{id:'asc'}],take:100})
  const items=rows.filter(p=>SERVICE_CATEGORIES.some(c=>c.id===p.category&&!c.regulated)).flatMap(p=>{const item=publicProvider(discoveryRecord(p),country,now);return item?[item]:[]})
  return jsonOk({items,categories:SERVICE_CATEGORIES,dispatchEnabled:false,locationMode:'COMMUNITY_ONLY',regulatedApprovalEnabled:false},{headers:{'Cache-Control':'no-store'}})
 })
}
