import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {commissionKeys} from '@/lib/marketplace-payment-preferences'
import {buildCheckoutReview} from '../marketplace-checkout-review'
import {heldSelections,holdPilotEnabled} from '../marketplace-hold-policy'
/** Consistent private read. No order, intent, provider call or inventory mutation. */
export async function reviewMarketplaceCheckout(requestId:string,userId:string){
 return db.$transaction(async tx=>{
  const row=await tx.marketplacePurchaseRequest.findUnique({where:{id:requestId},include:{store:{select:{id:true,ownerId:true,category:true,status:true,deletedAt:true,country:true,paymentPreferences:{select:{mobileMoney:true,card:true,cash:true,destination:true}},settlementOnboarding:{select:{state:true,testSubaccountCode:true,requestedBy:true}}}},stockHold:{select:{status:true,expiresAt:true,lines:{select:{variantId:true,quantity:true}}}}}})
  if(!row||row.buyerId!==userId&&row.store.ownerId!==userId)throw errors.notFound('Purchase request not found.')
  let basket;try{basket=heldSelections(row)}catch{throw errors.conflict('The saved purchase review requires reconciliation.')}
  const [rules,claim,variants]=await Promise.all([tx.marketplaceCommissionRule.findMany({where:{key:{in:commissionKeys(row.store)}},select:{key:true,basisPoints:true,updatedAt:true}}),tx.sandboxSettlementClaim.findUnique({where:{beneficiaryKind_beneficiaryId:{beneficiaryKind:'STORE',beneficiaryId:row.store.id}},select:{code:true}}),tx.marketplaceVariant.findMany({where:{storeId:row.store.id,id:{in:basket.items.map(x=>x.variantId)},active:true,product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},select:{id:true,priceMinor:true,currency:true,stockOnHand:true,stockReserved:true}})])
  const catalogueCurrent=basket.items.every(x=>{const v=variants.find(y=>y.id===x.variantId);return !!v&&v.priceMinor===x.expectedUnitPriceMinor&&v.currency===row.currency&&v.stockOnHand>=v.stockReserved&&v.stockOnHand>=x.quantity})
  const onboarding=row.store.settlementOnboarding
  let review;try{review=buildCheckoutReview({request:row,store:row.store,hold:row.stockHold,preferences:row.store.paymentPreferences,rules,sandboxRecipientVerified:!!(claim&&onboarding?.state==='SANDBOX_VERIFIED'&&claim.code===onboarding.testSubaccountCode&&onboarding.requestedBy===row.store.ownerId),pilotEnabled:holdPilotEnabled(process.env),catalogueCurrent,now:new Date()})}catch{throw errors.conflict('The saved purchase review requires reconciliation.')}
  // Commission allocation and merchant verification belong to the seller, not the buyer.
  if(row.store.ownerId===userId)return {...review,seller:true}
  return {currency:review.currency,totalMinor:review.totalMinor,unitCount:review.unitCount,holdValid:review.holdValid,catalogueCurrent:review.catalogueCurrent,expiresAt:review.expiresAt,methods:review.methods,checkoutEnabled:false as const,seller:false,blockers:[...(!catalogueCurrent?['Catalogue price or stock has changed. Review a new request.']:[]),'Checkout is not yet enabled. No payment will be collected.']}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
