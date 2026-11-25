import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,rateLimit,errors} from '@/server/api'
import {SERVICE_CATEGORIES,publicProvider} from '@/server/service-directory-policy'
import {discoveryRecord} from '@/server/service-provider-lifecycle'
import {matchServiceArea} from '@/server/provider-location-policy'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 return handle(async()=>{
  await rateLimit(req,'provider-nearby',30,60000)
  const areaId=req.nextUrl.searchParams.get('areaId')||'',category=req.nextUrl.searchParams.get('category')||''
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(areaId)||(category&&!SERVICE_CATEGORIES.some(c=>c.id===category)))throw errors.badRequest('Choose a catalogue community.')
  const result=await db.$transaction(async tx=>{
   const anchor=await tx.serviceArea.findFirst({where:{id:areaId,country:'GH',active:true}})
   if(!anchor)throw errors.notFound('Community unavailable.')
   const now=new Date()
   // Bound the indexed geographic candidate window before evaluating distance.
   // Ghana pilot only; no arbitrary caller GPS coordinates or exact distances.
   const areas=await tx.serviceArea.findMany({where:{country:'GH',active:true,latitude:{gte:anchor.latitude-.3,lte:anchor.latitude+.3},longitude:{gte:anchor.longitude-.3,lte:anchor.longitude+.3}},take:501,orderBy:{id:'asc'}})
   if(areas.length>500)throw errors.conflict('Community search temporarily exceeds pilot capacity.')
   const matches=new Map(areas.flatMap(a=>{const m=matchServiceArea({areaId:a.id,country:a.country,consentedAt:now,revokedAt:null},a,anchor,now);return m?[[a.id,m.proximity] as const]:[]}))
   const rows=await tx.serviceProviderProfile.findMany({where:{country:'GH',category:{in:SERVICE_CATEGORIES.filter(c=>!c.regulated&&(!category||c.id===category)).map(c=>c.id)},published:true,reviewStatus:'APPROVED',jurisdictionApproved:true,owner:{status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}},areaConsent:{is:{revokedAt:null,consentedAt:{lte:now},areaId:{in:[...matches.keys()]}}}},include:{areaConsent:{include:{area:true}}},orderBy:[{lastConfirmedAt:{sort:'desc',nulls:'last'}},{id:'asc'}],take:100})
   const items=rows.flatMap(p=>{
    const c=p.areaConsent
    if(!c?.area.active)return []
    const m=matchServiceArea({...c,country:c.area.country},c.area,anchor,now)
    const pub=publicProvider(discoveryRecord(p),'GH',now)
    return m&&pub?[{...pub,community:c.area.name,region:c.area.region,proximity:m.proximity}]:[]
   })
   return {items,area:{id:anchor.id,name:anchor.name,region:anchor.region}}
  },{isolationLevel:'RepeatableRead'})
  return jsonOk({...result,locationMode:'COMMUNITY_ANCHOR_ONLY',dispatchEnabled:false},{headers:{'Cache-Control':'no-store'}})
 })
}
