import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,errors,readJson,rateLimit} from '@/server/api'
import {ownedStore} from '@/server/services/marketplace'
import {DEFAULT_PREFERENCES,parsePaymentPreferences,PaymentPreferencesError,commissionKeys,effectiveCommission} from '@/lib/marketplace-payment-preferences'
type Context={params:Promise<{slug:string}>}
const select={mobileMoney:true,card:true,cash:true,destination:true} as const
async function view(store:{id:string;category:string}){
 const [preferences,rules,onboarding]=await Promise.all([db.marketplacePaymentPreference.findUnique({where:{storeId:store.id},select}),db.marketplaceCommissionRule.findMany({where:{key:{in:commissionKeys(store)}},select:{key:true,basisPoints:true}}),db.marketplaceSettlementOnboarding.findUnique({where:{storeId:store.id},select:{state:true,maskedAccount:true,bankName:true}})])
 const commission=effectiveCommission(rules,store)
 return {preferences:preferences??DEFAULT_PREFERENCES,commissionBps:commission?.basisPoints??null,commissionScope:commission?.key.split(':')[0]??null,settlementStatus:onboarding?.state??'NOT_CONFIGURED',settlementAccount:onboarding?{maskedAccount:onboarding.maskedAccount,bankName:onboarding.bankName}:null,checkoutEnabled:false}
}
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{const user=await requireUser();const store=await ownedStore((await ctx.params).slug,user.id);return jsonOk(await view(store))})
}
export async function PATCH(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'marketplace-payment-preferences',20,60000)
  const store=await ownedStore((await ctx.params).slug,user.id)
  if(store.status==='SUSPENDED')throw errors.forbidden('Suspended stores cannot modify payment preferences.')
  const account=await db.user.findUnique({where:{id:user.id},select:{emailVerifiedAt:true,status:true}})
  if(!account||account.status!=='ACTIVE')throw errors.forbidden('An active account is required.')
  if(!account.emailVerifiedAt)throw errors.emailVerificationRequired('Verify your email before changing payment preferences.')
  let preferences
  try{preferences=parsePaymentPreferences(await readJson(req))}catch(e){if(e instanceof PaymentPreferencesError)throw errors.badRequest(e.message);throw e}
  await db.$transaction(async tx=>{
   const before=await tx.marketplacePaymentPreference.findUnique({where:{storeId:store.id},select})
   await tx.marketplacePaymentPreference.upsert({where:{storeId:store.id},create:{storeId:store.id,...preferences},update:preferences})
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'store-owner',action:'marketplace.payment.preferences',entityType:'MarketplaceStore',entityId:store.id,before:JSON.stringify(before),after:JSON.stringify(preferences)}})
  })
  return jsonOk(await view(store))
 })
}
