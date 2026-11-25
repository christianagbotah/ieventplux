import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,errors,readJson,rateLimit} from '@/server/api'
import {parseSandboxReview,verifySandboxSubaccount,SandboxVerificationError} from '@/server/marketplace-paystack-sandbox'
export async function GET(){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const items=await db.marketplaceSettlementOnboarding.findMany({orderBy:{updatedAt:'desc'},take:100,select:{state:true,maskedAccount:true,bankName:true,createdAt:true,reviewedAt:true,store:{select:{slug:true,name:true,status:true}}}})
  return jsonOk({items,checkoutEnabled:false})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const user=await requireElevated()
  await rateLimit(req,'marketplace-settlement-review',10,60000)
  let input
  try{input=parseSandboxReview(await readJson(req))}catch(e){if(e instanceof SandboxVerificationError)throw errors.badRequest(e.message);throw e}
  const store=await db.marketplaceStore.findUnique({where:{slug:input.storeSlug,deletedAt:null},select:{id:true,ownerId:true,status:true}})
  if(!store||store.status==='SUSPENDED')throw errors.badRequest('Eligible store required.')
  if(store.ownerId===user.id)throw errors.forbidden('Finance reviewers cannot review their own stores.')
  const existing=await db.marketplaceSettlementOnboarding.findUnique({where:{storeId:store.id}})
  if(existing?.state!=='REQUESTED'||existing.requestedBy!==store.ownerId)throw errors.conflict('Pending request required.')
  let verified
  try{verified=await verifySandboxSubaccount(input.subaccountCode)}catch(e){if(e instanceof SandboxVerificationError)throw errors.badRequest(e.message);throw e}
  await db.$transaction(async tx=>{
   const prefs=await tx.marketplacePaymentPreference.findUnique({where:{storeId:store.id}})
   if(!prefs||prefs.destination!=='BANK'||(!prefs.mobileMoney&&!prefs.card))throw errors.conflict('Bank settlement preferences changed.')
   if(await tx.marketplaceSettlementOnboarding.findUnique({where:{testSubaccountCode:input.subaccountCode}}))throw errors.conflict('Test subaccount already linked.')
   const updated=await tx.marketplaceSettlementOnboarding.updateMany({where:{storeId:store.id,state:'REQUESTED',requestedBy:store.ownerId},data:{state:'SANDBOX_VERIFIED',testSubaccountCode:input.subaccountCode,...verified,reviewedBy:user.id,reviewedAt:new Date()}})
   if(updated.count!==1)throw errors.conflict('Request changed. Reload.')
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'finance-admin',action:'marketplace.settlement.sandbox_verified',entityType:'MarketplaceStore',entityId:store.id,after:JSON.stringify({state:'SANDBOX_VERIFIED'})}})
  })
  return jsonOk({settlementStatus:'SANDBOX_VERIFIED',checkoutEnabled:false})
 })
}
