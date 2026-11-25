import {expect,test} from 'bun:test'
import {parseSandboxReview,validateSandboxSubaccount} from './marketplace-paystack-sandbox'
const code='ACCT_test123'
const data={subaccount_code:code,domain:'test',currency:'GHS',active:true,is_verified:true,product:'collection',settlement_schedule:'AUTO',account_number:'1234567890',settlement_bank:'Test Bank'}
test('only masked verified Ghana sandbox account data is returned',()=>{
 expect(validateSandboxSubaccount({status:true,data},code)).toEqual({maskedAccount:'•••• 7890',bankName:'Test Bank'})
})
test('reject wrong domain, code, currency, verification and settlement schedule',()=>{
 for(const patch of [{domain:'live'},{currency:'NGN'},{active:false},{is_verified:false},{subaccount_code:'ACCT_other'},{settlement_schedule:'MANUAL'},{product:'transfer'},{account_number:'nope'}])expect(()=>validateSandboxSubaccount({status:true,data:{...data,...patch}},code)).toThrow()
})
test('review requires explicit mapping confirmation and rejects forged flags',()=>{
 const raw={storeSlug:'fire-boutique',subaccountCode:code,ownerReviewed:true}
 expect(parseSandboxReview(raw)).toEqual({storeSlug:raw.storeSlug,subaccountCode:code})
 expect(()=>parseSandboxReview({...raw,ownerReviewed:false})).toThrow()
 expect(()=>parseSandboxReview({...raw,checkoutEnabled:true})).toThrow()
})
