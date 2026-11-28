import {effectiveCommission,type CommissionRule} from '@/lib/marketplace-payment-preferences'
import {heldSelections} from './marketplace-hold-policy'
import {matchesHeldLines} from './marketplace-checkout-draft-policy'
import {marketplacePaymentPlan} from './marketplace-payment-plan-policy'
export type CheckoutMethod='MOBILE_MONEY'|'CARD'|'CASH'
export function buildCheckoutReview(input:{request:{id:string;items:unknown;totalMinor:number;unitCount:number;currency:string;status:string};store:{id:string;category:string;status:string;deletedAt:Date|null;country:string};hold:{status:string;expiresAt:Date;lines:{variantId:string;quantity:number}[]}|null;preferences:{mobileMoney:boolean;card:boolean;cash:boolean;destination:string}|null;rules:(CommissionRule&{updatedAt:Date})[];sandboxRecipientVerified:boolean;pilotEnabled:boolean;catalogueCurrent:boolean;now:Date}){
 const {request,store,hold}=input
 const basket=heldSelections(request)
 const methods:CheckoutMethod[]=[]
 if(input.preferences?.mobileMoney)methods.push('MOBILE_MONEY')
 if(input.preferences?.card)methods.push('CARD')
 if(input.preferences?.cash)methods.push('CASH')
 const holdValid=hold?.status==='HELD'&&hold.expiresAt>input.now&&matchesHeldLines(basket.items,hold.lines)
 const blockers:string[]=[]
 if(!input.pilotEnabled)blockers.push('Stock reservation pilot is disabled.')
 if(store.status!=='ACTIVE'||store.deletedAt||store.country!=='GH')blockers.push('The store is not eligible for Ghana checkout.')
 if(request.status!=='ACKNOWLEDGED'||!holdValid)blockers.push('An active stock reservation is required.')
 if(!input.catalogueCurrent)blockers.push('Catalogue price or stock has changed. Review a new request before payment planning.')
 if(!methods.length)blockers.push('The seller has not selected any payment methods.')
 const effective=effectiveCommission(input.rules,store),rule=input.rules.find(r=>r.key===effective?.key)
 let allocation:null|{platformMinor:number;sellerMinor:number;basisPoints:number}=null
 if(rule){try{const plan=marketplacePaymentPlan(request,store,rule);allocation={platformMinor:plan.platformGrossMinor,sellerMinor:plan.beneficiaryGrossMinor,basisPoints:rule.basisPoints}}catch{/* Uncertified commission or amount cannot be presented as a valid split. */}}
 if(!allocation)blockers.push('A valid seller commission rule is required.')
 if(!methods.some(x=>x!=='CASH'))blockers.push('An online payment preference is required for payment planning.')
 if(input.preferences?.destination!=='BANK')blockers.push('Bank settlement is required for the current test integration.')
 if(methods.some(x=>x!=='CASH')&&!input.sandboxRecipientVerified)blockers.push('Online payment settlement has not been verified in sandbox.')
 blockers.push('Live payment and order confirmation are not enabled.')
 return {currency:'GHS' as const,totalMinor:request.totalMinor,unitCount:request.unitCount,holdValid:!!holdValid,catalogueCurrent:input.catalogueCurrent,expiresAt:hold?.expiresAt.toISOString()??null,methods,allocation,sandboxRecipientVerified:input.sandboxRecipientVerified,checkoutEnabled:false as const,blockers}
}
