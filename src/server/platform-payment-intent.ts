import {createHash} from 'node:crypto'
import {planPlatformPayment,type Purchase} from './platform-payment-routing'
/** Server-only input: never use a client-supplied amount, beneficiary or pricing version. */
export type IntentInput=Purchase&{sourceId:string;pricingVersion:string}
export function paymentIntentSnapshot(input:IntentInput){
 for(const value of [input.sourceId,input.pricingVersion]){
  if(typeof value!=='string'||!value.trim()||value.length>100||value!==value.trim())throw new Error('Immutable source and pricing version are required.')
 }
 const plan=planPlatformPayment(input)
 const fields={
  purpose:plan.purpose,sourceId:input.sourceId,reference:plan.reference,currency:plan.currency,
  totalMinor:plan.totalMinor,platformGrossMinor:plan.platformGrossMinor,beneficiaryGrossMinor:plan.beneficiaryGrossMinor,
  beneficiaryKind:plan.beneficiary?.kind??null,beneficiaryId:plan.beneficiary?.id??null,route:plan.route,
  pricingVersion:input.pricingVersion,
 }
 return {...fields,snapshotHash:createHash('sha256').update(JSON.stringify(fields)).digest('hex'),status:'PLANNED' as const}
}
export function requireMatchingIntent(existing:{snapshotHash:string},snapshot:{snapshotHash:string}){
 if(existing.snapshotHash!==snapshot.snapshotHash)throw new Error('Purchase already has a different immutable payment snapshot.')
}
