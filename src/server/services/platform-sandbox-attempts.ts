import {db} from '@/lib/db'
import {buildSandboxCheckout} from '../platform-paystack-adapter'
import {paymentIntentSnapshot,requireMatchingIntent} from '../platform-payment-intent'
import {verifyPaystackWebhook,parseSandboxChargeNotification} from '../platform-paystack-webhook'
import type {Purchase} from '../platform-payment-routing'
/** No network calls or public endpoint. Test-only durable preparation.
 * Caller must be an authorized server-side certification workflow. */
export async function prepareSandboxAttempt(intentId:string,email:string){
 const record=await db.platformPaymentIntent.findUniqueOrThrow({where:{id:intentId}})
 if(record.status!=='PLANNED'||record.currency!=='GHS')throw new Error('Planned Ghana intent required.')
 const kind=record.beneficiaryKind
 if(kind!==null&&kind!=='STORE'&&kind!=='ORGANIZATION')throw new Error('Beneficiary type is not certified.')
 const snapshot=paymentIntentSnapshot({purpose:record.purpose as Purchase['purpose'],sourceId:record.sourceId,reference:record.reference,currency:'GHS',totalMinor:record.totalMinor,pricingVersion:record.pricingVersion,...(kind&&record.beneficiaryId?{beneficiary:{kind,id:record.beneficiaryId},commissionMinor:record.platformGrossMinor}:{})})
 requireMatchingIntent(record,snapshot)
 if(record.route!==snapshot.route||record.beneficiaryGrossMinor!==snapshot.beneficiaryGrossMinor)throw new Error('Intent inconsistent.')
 // Namespace test references so test notifications cannot target legacy real payments.
 if(!snapshot.reference.startsWith('TEST-'))throw new Error('Sandbox reference prefix required.')
 let recipient:Parameters<typeof buildSandboxCheckout>[2]
 if(kind&&record.beneficiaryId){
  const id=record.beneficiaryId
  const claim=await db.sandboxSettlementClaim.findUnique({where:{beneficiaryKind_beneficiaryId:{beneficiaryKind:kind,beneficiaryId:id}}})
  const onboarding=kind==='STORE'?await db.marketplaceSettlementOnboarding.findUnique({where:{storeId:id},include:{store:{select:{status:true,deletedAt:true,country:true,ownerId:true}}}}):await db.organizationSettlementOnboarding.findUnique({where:{orgId:id},include:{org:{select:{status:true,deletedAt:true,country:true,ownerId:true,verifiedAt:true,verification:{select:{status:true}}}}}})
  if(!claim||!onboarding||onboarding.state!=='SANDBOX_VERIFIED'||onboarding.testSubaccountCode!==claim.code)throw new Error('Verified test recipient required.')
  if('store' in onboarding){
   if(onboarding.store.deletedAt||onboarding.store.status!=='ACTIVE'||onboarding.store.country!=='GH'||onboarding.requestedBy!==onboarding.store.ownerId)throw new Error('Store not eligible.')
  }else if(onboarding.org.deletedAt||onboarding.org.status!=='ACTIVE'||onboarding.org.country!=='GH'||!onboarding.org.verifiedAt||onboarding.org.verification?.status!=='APPROVED'||onboarding.requestedBy!==onboarding.org.ownerId)throw new Error('Organization not eligible.')
  recipient={kind,id,code:claim.code,environment:'test',state:'SANDBOX_VERIFIED'}
 }
 const plan=buildSandboxCheckout(snapshot,email,recipient)
 const expected={intentId:record.id,reference:plan.reference,expectedAmountMinor:plan.amount,currency:plan.currency,recipientCode:plan.subaccount??null}
 const attempt=await db.platformSandboxAttempt.upsert({where:{intentId:record.id},create:expected,update:{}})
 if(attempt.reference!==expected.reference||attempt.expectedAmountMinor!==expected.expectedAmountMinor||attempt.currency!==expected.currency||attempt.recipientCode!==expected.recipientCode)throw new Error('Existing attempt mapping mismatch.')
 return {attemptId:attempt.id,status:attempt.status,plan,executionEnabled:false as const}
}
/** Record only a correctly signed notification, never payment success.
 * Independent provider verification and allocation evidence remain required. */
export async function recordSandboxNotification(raw:Uint8Array,header:string,keys:Readonly<Record<string,string>>){
 if(!verifyPaystackWebhook(raw,header,keys))throw new Error('Invalid sandbox webhook signature.')
 const event=parseSandboxChargeNotification(raw)
 if(!event.reference.startsWith('TEST-'))throw new Error('Not a sandbox reference.')
 return db.$transaction(async tx=>{
  const attempt=await tx.platformSandboxAttempt.findUnique({where:{reference:event.reference}})
  if(!attempt||attempt.expectedAmountMinor!==event.amountMinor||attempt.currency!==event.currency)throw new Error('Notification does not match prepared attempt.')
  if(attempt.providerTransactionId&&attempt.providerTransactionId!==event.providerTransactionId)throw new Error('Conflicting provider transaction.')
  const updated=await tx.platformSandboxAttempt.updateMany({where:{id:attempt.id,OR:[{providerTransactionId:null},{providerTransactionId:event.providerTransactionId}]},data:{providerTransactionId:event.providerTransactionId,status:'NOTIFICATION_RECEIVED'}})
  if(updated.count!==1)throw new Error('Conflicting provider transaction.')
  await tx.platformSandboxNotification.upsert({where:{dedupKey:event.dedupKey},create:{dedupKey:event.dedupKey,attemptId:attempt.id,providerTransactionId:event.providerTransactionId},update:{}})
  return {status:'NOTIFICATION_RECEIVED' as const,fulfillmentEnabled:false as const}
 })
}
