import {effectiveCommission,type CommissionRule} from '@/lib/marketplace-payment-preferences'
import {heldSelections} from './marketplace-hold-policy'
import {planPlatformPayment} from './platform-payment-routing'
export type CheckoutMethod='MOBILE_MONEY'|'CARD'|'CASH'
export function buildCheckoutReview(input:{request:{id:string;items:unknown;totalMinor:number;unitCount:number;currency:string;status:string};store:{id:string;category:string;status:string;deletedAt:Date|null;country:string};hold:{status:string;expiresAt:Date;lines:{variantId:string;quantity:number}[]}|null;preferences:{mobileMoney:boolean;card:boolean;cash:boolean}|null;rules:CommissionRule[];sandboxRecipientVerified:boolean;pilotEnabled:boolean;now:Date}){
 const {request,store,hold}=input
 const basket=heldSelections(request)
 const methods:CheckoutMethod[]=[]
 if(input.preferences?.mobileMoney)methods.push('MOBILE_MONEY')
 if(input.preferences?.card)methods.push('CARD')
 if(input.preferences?.cash)methods.push('CASH')
 const holdValid=hold?.status==='HELD'&&hold.expiresAt>input.now&&hold.lines.length===basket.items.length&&basket.items.every(x=>hold.lines.some(y=>y.variantId===x.variantId&&y.quantity===x.quantity))
 const blockers:string[]=[]
 if(!input.pilotEnabled)blockers.push('Stock reservation pilot is disabled.')
 if(store.status!=='ACTIVE'||store.deletedAt||store.country!=='GH')blockers.push('The store is not eligible for Ghana checkout.')
 if(request.status!=='ACKNOWLEDGED'||!holdValid)blockers.push('An active stock reservation is required.')
 if(!methods.length)blockers.push('The seller has not selected any payment methods.')
 const rule=effectiveCommission(input.rules,store)
 let allocation:null|{platformMinor:number;sellerMinor:number;basisPoints:number}=null
 if(rule){
  const commission=Math.floor((request.totalMinor*rule.basisPoints+5000)/10000)
  if(commission<request.totalMinor){const plan=planPlatformPayment({purpose:'MARKETPLACE_GOODS',currency:'GHS',totalMinor:request.totalMinor,reference:'REVIEW-'+request.id,beneficiary:{kind:'STORE',id:store.id},commissionMinor:commission});allocation={platformMinor:plan.platformGrossMinor,sellerMinor:plan.beneficiaryGrossMinor,basisPoints:rule.basisPoints}}
 }
 if(!allocation)blockers.push('A valid seller commission rule is required.')
 if(methods.some(x=>x!=='CASH')&&!input.sandboxRecipientVerified)blockers.push('Online payment settlement has not been verified in sandbox.')
 blockers.push('Live payment and order confirmation are not enabled.')
 return {currency:'GHS' as const,totalMinor:request.totalMinor,unitCount:request.unitCount,holdValid:!!holdValid,expiresAt:hold?.expiresAt.toISOString()??null,methods,allocation,sandboxRecipientVerified:input.sandboxRecipientVerified,checkoutEnabled:false as const,blockers}
}
