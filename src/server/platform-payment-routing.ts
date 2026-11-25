/** Pure planning contract. No checkout, custody, settlement or ledger write.
 * Inputs must be resolved from an authorized, immutable server-side purchase.
 */
export const THIRD_PARTY_PURPOSES=['EVENT_TICKET','EVENT_SOUVENIR','MARKETPLACE_GOODS','MARKETPLACE_SERVICE','DIGITAL_PRODUCT','PAID_EVENT_ACCESS','PAID_VOTING','FUNDRAISING'] as const
export const PLATFORM_PURPOSES=['SUBSCRIPTION','EVENT_BOOST','STORE_BOOST','PRODUCT_BOOST','SPONSORED_POST','PREMIUM_FEATURE','SMS_PACKAGE'] as const
type ThirdParty=typeof THIRD_PARTY_PURPOSES[number]
type Platform=typeof PLATFORM_PURPOSES[number]
type Purpose=ThirdParty|Platform
type Beneficiary={kind:'ORGANIZATION'|'STORE'|'CAMPAIGN';id:string}
export type Purchase={purpose:Purpose;currency:'GHS';totalMinor:number;reference:string;beneficiary?:Beneficiary;commissionMinor?:number}
export type PaymentRoutingPlan={
 purpose:Purpose;reference:string;currency:'GHS';totalMinor:number;platformGrossMinor:number;beneficiaryGrossMinor:number;
 beneficiary:Beneficiary|null;route:'FREE'|'PLATFORM_DIRECT'|'PROVIDER_SPLIT';requiresProviderCertification:boolean;executionEnabled:false
}
export function planPlatformPayment(input:Purchase):PaymentRoutingPlan{
 if(input.currency!=='GHS'||!Number.isSafeInteger(input.totalMinor)||input.totalMinor<0||input.totalMinor>100_000_000||typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>100)throw new Error('Invalid immutable payment snapshot.')
 const platform=PLATFORM_PURPOSES.some(p=>p===input.purpose)
 const thirdParty=THIRD_PARTY_PURPOSES.some(p=>p===input.purpose)
 if(!platform&&!thirdParty)throw new Error('Unknown payment purpose.')
 if(platform&&(input.beneficiary!==undefined||input.commissionMinor!==undefined))throw new Error('Platform services cannot route revenue to third parties.')
 const expectedKind=input.purpose==='FUNDRAISING'?'CAMPAIGN':['MARKETPLACE_GOODS','MARKETPLACE_SERVICE','DIGITAL_PRODUCT'].includes(input.purpose)?'STORE':'ORGANIZATION'
 if(thirdParty&&(!input.beneficiary||(input.beneficiary.kind!==expectedKind&&!(input.purpose==='EVENT_SOUVENIR'&&input.beneficiary.kind==='STORE'))||typeof input.beneficiary.id!=='string'||!input.beneficiary.id.trim()||input.beneficiary.id.length>100))throw new Error('A matching beneficiary is required.')
 const commission=platform?input.totalMinor:input.commissionMinor
 if(typeof commission!=='number'||!Number.isSafeInteger(commission)||commission<0||commission>input.totalMinor||(thirdParty&&input.totalMinor>0&&commission===input.totalMinor))throw new Error('Invalid configured commission.')
 return {purpose:input.purpose,reference:input.reference,currency:input.currency,totalMinor:input.totalMinor,platformGrossMinor:commission,beneficiaryGrossMinor:input.totalMinor-commission,beneficiary:thirdParty?{...input.beneficiary!}:null,route:input.totalMinor===0?'FREE':platform?'PLATFORM_DIRECT':'PROVIDER_SPLIT',requiresProviderCertification:input.totalMinor>0,executionEnabled:false}
}
