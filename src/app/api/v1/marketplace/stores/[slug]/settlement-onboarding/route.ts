import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,errors,rateLimit} from '@/server/api'
import {ownedStore} from '@/server/services/marketplace'
type Context={params:Promise<{slug:string}>}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'marketplace-settlement-request',8,60000)
  const store=await ownedStore((await ctx.params).slug,user.id)
  const account=await db.user.findUnique({where:{id:user.id},select:{emailVerifiedAt:true,status:true}})
  if(!account||account.status!=='ACTIVE'||store.status==='SUSPENDED')throw errors.forbidden('An active account and eligible store are required.')
  if(!account.emailVerifiedAt)throw errors.emailVerificationRequired('Verify your email before requesting settlement onboarding.')
  await db.$transaction(async tx=>{
   const prefs=await tx.marketplacePaymentPreference.findUnique({where:{storeId:store.id}})
   if(!prefs||prefs.destination!=='BANK'||(!prefs.mobileMoney&&!prefs.card))throw errors.badRequest('Save a bank settlement preference and an online payment method first.')
   const existing=await tx.marketplaceSettlementOnboarding.findUnique({where:{storeId:store.id}})
   if(existing)throw errors.conflict('A settlement onboarding request already exists.')
   await tx.marketplaceSettlementOnboarding.create({data:{storeId:store.id,requestedBy:user.id}})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'store-owner',action:'marketplace.settlement.request',entityType:'MarketplaceStore',entityId:store.id,after:JSON.stringify({state:'REQUESTED'})}})
  })
  return jsonOk({settlementStatus:'REQUESTED',checkoutEnabled:false},{status:201})
 })
}
