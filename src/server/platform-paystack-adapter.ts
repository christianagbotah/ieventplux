import {createHmac,timingSafeEqual} from 'node:crypto'
import {paymentIntentSnapshot} from './platform-payment-intent'
type Snapshot=ReturnType<typeof paymentIntentSnapshot>
type TestRecipient={kind:'STORE'|'ORGANIZATION'|'CAMPAIGN';id:string;code:string;environment:'test';state:'SANDBOX_VERIFIED'}
export type SandboxCheckoutPlan={reference:string;amount:number;currency:'GHS';email:string;subaccount?:string;transaction_charge?:number;bearer?:'account'|'subaccount';metadata:string}
/** Only trusted server-side immutable snapshots and verified registry mappings.
 * No public routes or live payment invocation. A zero commission split is
 * withheld pending provider confirmation of zero override semantics. */
export function buildSandboxCheckout(snapshot:Snapshot,email:string,recipient?:TestRecipient):SandboxCheckoutPlan{
 const rebuilt=paymentIntentSnapshot({purpose:snapshot.purpose,sourceId:snapshot.sourceId,reference:snapshot.reference,currency:snapshot.currency,totalMinor:snapshot.totalMinor,pricingVersion:snapshot.pricingVersion,...(snapshot.beneficiaryKind&&snapshot.beneficiaryId?{beneficiary:{kind:snapshot.beneficiaryKind,id:snapshot.beneficiaryId},commissionMinor:snapshot.platformGrossMinor}:{})})
 if(snapshot.status!=='PLANNED'||rebuilt.snapshotHash!==snapshot.snapshotHash||rebuilt.route!==snapshot.route||rebuilt.platformGrossMinor!==snapshot.platformGrossMinor||rebuilt.beneficiaryGrossMinor!==snapshot.beneficiaryGrossMinor)throw new Error('Invalid payment snapshot.')
 if(snapshot.route==='FREE')throw new Error('Free purchases must not call a payment provider.')
 if(!/^[A-Za-z0-9.=-]{1,100}$/.test(snapshot.reference)||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Invalid checkout identity.')
 const base:SandboxCheckoutPlan={reference:snapshot.reference,amount:snapshot.totalMinor,currency:'GHS',email,metadata:JSON.stringify({intent_reference:snapshot.reference,snapshot_hash:snapshot.snapshotHash})}
 if(snapshot.route==='PLATFORM_DIRECT'){
  if(recipient)throw new Error('Platform services cannot use a seller subaccount.')
  return base
 }
 if(!recipient||recipient.kind!==snapshot.beneficiaryKind||recipient.id!==snapshot.beneficiaryId||recipient.environment!=='test'||recipient.state!=='SANDBOX_VERIFIED'||!/^ACCT_[A-Za-z0-9]{5,80}$/.test(recipient.code))throw new Error('Matching verified sandbox recipient required.')
 if(snapshot.platformGrossMinor<=0)throw new Error('Zero commission split requires provider certification.')
 return {...base,subaccount:recipient.code,transaction_charge:snapshot.platformGrossMinor,bearer:'account'}
}
function object(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid provider response.')
 return raw as Record<string,unknown>
}
export function parseSandboxInitialization(raw:unknown,reference:string){
 const response=object(raw),data=object(response.data)
 if(response.status!==true||data.reference!==reference||typeof data.authorization_url!=='string')throw new Error('Checkout response reference mismatch.')
 const url=new URL(data.authorization_url)
 if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.port||url.username||url.password)throw new Error('Invalid checkout URL.')
 return {reference,checkoutUrl:url.toString(),environment:'test' as const}
}
/** Independent provider verification identifies a successful collection only.
 * A split still needs authoritative allocation/settlement evidence. */
export function parseSandboxCollection(raw:unknown,plan:SandboxCheckoutPlan){
 const response=object(raw),data=object(response.data)
 if(response.status!==true||data.domain!=='test'||data.status!=='success'||data.reference!==plan.reference||data.amount!==plan.amount||data.currency!==plan.currency)throw new Error('Payment verification mismatch.')
 if(plan.subaccount){
  const sub=object(data.subaccount)
  if(sub.subaccount_code!==plan.subaccount)throw new Error('Provider recipient mismatch.')
 }else if(data.subaccount!=null&&Object.keys(object(data.subaccount)).length!==0)throw new Error('Unexpected third-party recipient.')
 return {reference:plan.reference,amountMinor:plan.amount,currency:plan.currency,collection:'SANDBOX_CONFIRMED' as const,allocation:plan.subaccount?'REVIEW_REQUIRED' as const:'PLATFORM_DIRECT' as const,fulfillmentEnabled:false as const}
}
/** Legacy x-paystack-signature format only, on exact raw request bytes.
 * New signing-secret protocol requires separate implementation/certification. */
export function verifyLegacySandboxSignature(raw:Uint8Array,signature:string,key:string){
 if(!/^sk_test_[A-Za-z0-9]+$/.test(key)||! /^[a-f0-9]{128}$/i.test(signature))return false
 return timingSafeEqual(createHmac('sha512',key).update(raw).digest(),Buffer.from(signature,'hex'))
}
