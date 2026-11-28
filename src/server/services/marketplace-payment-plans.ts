import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {commissionKeys,effectiveCommission} from '@/lib/marketplace-payment-preferences'
import {heldSelections} from '../marketplace-hold-policy'
import {matchesHeldLines,checkoutDraftEnabled} from '../marketplace-checkout-draft-policy'
import {marketplacePaymentPlan} from '../marketplace-payment-plan-policy'
import {requireMatchingIntent} from '../platform-payment-intent'
/** Internal planning checkpoint only. No network, payout, order, attempt or public route.
 * Never promote this PLAN namespace to TEST or live execution. A separately
 * certified workflow must revalidate the hold and create its own payment record. */
export async function recordMarketplacePaymentPlan(draftId:string,buyerId:string){
 if(!checkoutDraftEnabled(process.env)||process.env.IEVENTPLUX_MARKETPLACE_PAYMENT_PLAN_ENABLED!=='true')throw errors.unavailable('PAYMENT_PLAN_DISABLED','Payment planning is not available yet.')
 try{return await db.$transaction(async tx=>{
  const draft=await tx.marketplaceCheckoutDraft.findUnique({where:{id:draftId},include:{hold:{include:{lines:true,request:{include:{store:{select:{id:true,ownerId:true,status:true,deletedAt:true,currency:true,country:true,category:true}}}}}}}})
  if(!draft||draft.hold.request.buyerId!==buyerId)throw errors.notFound('Checkout draft not found.')
  const {hold}=draft,{request}=hold,{store}=request
  if(draft.status!=='PREPARED'||hold.status!=='HELD'||hold.expiresAt<=new Date()||request.status!=='ACKNOWLEDGED'||store.status!=='ACTIVE'||store.deletedAt||store.country!=='GH'||draft.currency!==request.currency||draft.currency!==store.currency||draft.totalMinor!==request.totalMinor||draft.unitCount!==request.unitCount)throw errors.conflict('An active, reviewed Ghana stock reservation is required.')
  if(!await tx.user.findFirst({where:{id:buyerId,status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}})||!await tx.user.findFirst({where:{id:store.ownerId,status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}}))throw errors.forbidden('Active verified buyer and seller accounts are required.')
  let review,saved;try{review=heldSelections(request);saved=heldSelections(draft)}catch{throw errors.conflict('Checkout review is invalid.')}
  if(review.fingerprint!==saved.fingerprint||!matchesHeldLines(review.items,hold.lines))throw errors.conflict('Held inventory requires reconciliation.')
  const variants=await tx.marketplaceVariant.findMany({where:{id:{in:review.items.map(x=>x.variantId)},storeId:store.id,active:true,product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},select:{id:true,priceMinor:true,currency:true,stockOnHand:true,stockReserved:true}})
  if(review.items.some(x=>{const v=variants.find(y=>y.id===x.variantId);return !v||v.currency!==draft.currency||v.priceMinor!==x.expectedUnitPriceMinor||v.stockReserved<x.quantity||v.stockOnHand<v.stockReserved}))throw errors.conflict('Stock or reviewed catalogue price changed.')
  const prefs=await tx.marketplacePaymentPreference.findUnique({where:{storeId:store.id}})
  const recipient=await tx.marketplaceSettlementOnboarding.findUnique({where:{storeId:store.id}})
  const claim=await tx.sandboxSettlementClaim.findUnique({where:{beneficiaryKind_beneficiaryId:{beneficiaryKind:'STORE',beneficiaryId:store.id}}})
  if(!prefs||prefs.destination!=='BANK'||(!prefs.mobileMoney&&!prefs.card)||!recipient||recipient.state!=='SANDBOX_VERIFIED'||recipient.requestedBy!==store.ownerId||!claim||claim.code!==recipient.testSubaccountCode)throw errors.conflict('Seller payment settings and verified test settlement mapping are required.')
  const rules=await tx.marketplaceCommissionRule.findMany({where:{key:{in:commissionKeys(store)}}})
  const effective=effectiveCommission(rules,store),rule=rules.find(r=>r.key===effective?.key)
  if(!rule)throw errors.conflict('A reviewed commission policy is required.')
  let snapshot;try{snapshot=marketplacePaymentPlan(draft,store,rule)}catch{throw errors.conflict('Commission split is not certified for this amount.')}
  const existing=await tx.platformPaymentIntent.findUnique({where:{purpose_sourceId:{purpose:snapshot.purpose,sourceId:draft.id}}})
  if(existing){try{requireMatchingIntent(existing,snapshot)}catch{throw errors.conflict('Payment policy changed since planning. Release the hold and review a new request.')}return {intentId:existing.id,totalMinor:existing.totalMinor,platformMinor:existing.platformGrossMinor,sellerMinor:existing.beneficiaryGrossMinor,replayed:true,executionEnabled:false as const}}
  const planned=await tx.platformPaymentIntent.create({data:snapshot})
  await tx.auditLog.create({data:{actorUserId:buyerId,actorLabel:'marketplace-buyer',action:'marketplace.payment.plan',entityType:'PlatformPaymentIntent',entityId:planned.id}})
  return {intentId:planned.id,totalMinor:planned.totalMinor,platformMinor:planned.platformGrossMinor,sellerMinor:planned.beneficiaryGrossMinor,replayed:false,executionEnabled:false as const}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(e){if(e&&typeof e==='object'&&'code' in e&&['P2034','P2002'].includes(String(e.code)))throw errors.conflict('Payment planning conflicted. Refresh and retry.');throw e}
}
