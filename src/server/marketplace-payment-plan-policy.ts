import {createHash} from 'node:crypto'
import {paymentIntentSnapshot} from './platform-payment-intent'
/** Immutable planning only. PLAN references cannot enter sandbox or live execution. */
export function marketplacePaymentPlan(draft:{id:string;currency:string;totalMinor:number},store:{id:string},rule:{key:string;basisPoints:number;updatedAt:Date}){
 if(draft.currency!=='GHS'||!Number.isSafeInteger(draft.totalMinor)||draft.totalMinor<1||draft.totalMinor>100000000||!Number.isSafeInteger(rule.basisPoints)||rule.basisPoints<0||rule.basisPoints>9999||!rule.key||!Number.isFinite(rule.updatedAt.getTime()))throw new Error('Invalid marketplace pricing policy.')
 const commission=Math.round(draft.totalMinor*rule.basisPoints/10000)
 // A zero override is intentionally withheld until payment-provider certification.
 if(commission<=0||commission>=draft.totalMinor)throw new Error('Commission split requires provider certification.')
 const pricingVersion='marketplace:'+createHash('sha256').update(JSON.stringify({key:rule.key,basisPoints:rule.basisPoints,updatedAt:rule.updatedAt.toISOString()})).digest('hex')
 return paymentIntentSnapshot({purpose:'MARKETPLACE_GOODS',sourceId:draft.id,reference:'PLAN-'+createHash('sha256').update(draft.id).digest('hex'),currency:'GHS',totalMinor:draft.totalMinor,commissionMinor:commission,beneficiary:{kind:'STORE',id:store.id},pricingVersion})
}
