import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,errors,readJson,rateLimit} from '@/server/api'
import {parseCommissionRule,PaymentPreferencesError} from '@/lib/marketplace-payment-preferences'
export async function GET(){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const rules=await db.marketplaceCommissionRule.findMany({orderBy:{key:'asc'},select:{key:true,basisPoints:true}})
  const ids=rules.filter(r=>r.key.startsWith('store:')).map(r=>r.key.slice(6))
  const stores=await db.marketplaceStore.findMany({where:{id:{in:ids},deletedAt:null},select:{id:true,slug:true,name:true}})
  return jsonOk({rules:rules.map(r=>({...r,store:stores.find(s=>'store:'+s.id===r.key)??null})),checkoutEnabled:false})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const user=await requireElevated()
  await rateLimit(req,'marketplace-commission-settings',15,60000)
  let rule
  try{rule=parseCommissionRule(await readJson(req))}catch(e){if(e instanceof PaymentPreferencesError)throw errors.badRequest(e.message);throw e}
  let key=rule.scope==='global'?'global':'category:'+rule.target
  if(rule.scope==='store'){
   const store=await db.marketplaceStore.findUnique({where:{slug:rule.target,deletedAt:null},select:{id:true}})
   if(!store)throw errors.notFound('Store not found.')
   key='store:'+store.id
  }
  const basisPoints=rule.basisPoints
  await db.$transaction(async tx=>{
   const before=await tx.marketplaceCommissionRule.findUnique({where:{key},select:{basisPoints:true}})
   if(basisPoints===null)await tx.marketplaceCommissionRule.deleteMany({where:{key}})
   else await tx.marketplaceCommissionRule.upsert({where:{key},create:{key,basisPoints,updatedBy:user.id},update:{basisPoints,updatedBy:user.id}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'finance-admin',action:'marketplace.commission.configure',entityType:'MarketplaceCommissionRule',entityId:key.slice(0,64),before:JSON.stringify(before),after:JSON.stringify({key,basisPoints})}})
  })
  return jsonOk({key,basisPoints,checkoutEnabled:false})
 })
}
