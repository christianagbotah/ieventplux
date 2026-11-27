import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {commissionKeys} from '@/lib/marketplace-payment-preferences'
import {buildCheckoutReview} from '../marketplace-checkout-review'
import {holdPilotEnabled} from '../marketplace-hold-policy'
/** Consistent private read. No order, intent, provider call or inventory mutation. */
export async function reviewMarketplaceCheckout(requestId:string,userId:string){
 return db.$transaction(async tx=>{
  const row=await tx.marketplacePurchaseRequest.findUnique({where:{id:requestId},include:{store:{select:{id:true,ownerId:true,category:true,status:true,deletedAt:true,country:true,paymentPreferences:{select:{mobileMoney:true,card:true,cash:true}},settlementOnboarding:{select:{state:true,testSubaccountCode:true,requestedBy:true}}}},stockHold:{select:{status:true,expiresAt:true,lines:{select:{variantId:true,quantity:true}}}}}})
  if(!row||row.buyerId!==userId&&row.store.ownerId!==userId)throw errors.notFound('Purchase request not found.')
  const [rules,claim]=await Promise.all([tx.marketplaceCommissionRule.findMany({where:{key:{in:commissionKeys(row.store)}},select:{key:true,basisPoints:true}}),tx.sandboxSettlementClaim.findUnique({where:{beneficiaryKind_beneficiaryId:{beneficiaryKind:'STORE',beneficiaryId:row.store.id}},select:{code:true}})])
  const onboarding=row.store.settlementOnboarding
  const review=buildCheckoutReview({request:row,store:row.store,hold:row.stockHold,preferences:row.store.paymentPreferences,rules,sandboxRecipientVerified:!!(claim&&onboarding?.state==='SANDBOX_VERIFIED'&&claim.code===onboarding.testSubaccountCode&&onboarding.requestedBy===row.store.ownerId),pilotEnabled:holdPilotEnabled(process.env),now:new Date()})
  // Commission allocation and merchant verification belong to the seller, not the buyer.
  if(row.store.ownerId===userId)return {...review,seller:true}
  return {currency:review.currency,totalMinor:review.totalMinor,unitCount:review.unitCount,holdValid:review.holdValid,expiresAt:review.expiresAt,methods:review.methods,checkoutEnabled:false as const,seller:false,blockers:['Checkout is not yet enabled. No payment will be collected.']}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
