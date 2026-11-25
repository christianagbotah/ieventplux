import {expect,test} from 'bun:test'
import {createHmac} from 'node:crypto'
import {paymentIntentSnapshot} from './platform-payment-intent'
import {buildSandboxCheckout,parseSandboxInitialization,parseSandboxCollection,verifyLegacySandboxSignature} from './platform-paystack-adapter'
const base={sourceId:'order1',reference:'TEST-ORD-1',currency:'GHS' as const,totalMinor:10000,pricingVersion:'fee-1'}
const direct=paymentIntentSnapshot({...base,purpose:'SUBSCRIPTION'})
const split=paymentIntentSnapshot({...base,purpose:'EVENT_TICKET',beneficiary:{kind:'ORGANIZATION',id:'org1'},commissionMinor:1000})
const recipient={kind:'ORGANIZATION' as const,id:'org1',code:'ACCT_test123',environment:'test' as const,state:'SANDBOX_VERIFIED' as const}
const email='buyer@example.invalid'
test('direct subscriptions and boosts use no subaccount or commission override',()=>{
 for(const purpose of ['SUBSCRIPTION','EVENT_BOOST','STORE_BOOST'] as const){
  const p=buildSandboxCheckout(paymentIntentSnapshot({...base,purpose}),email)
  expect(p.amount).toBe(10000);expect(p.subaccount).toBeUndefined();expect(p.transaction_charge).toBeUndefined()
 }
 expect(()=>buildSandboxCheckout(direct,email,recipient)).toThrow()
})
test('split uses exact stored commission and verified matching recipient',()=>{
 const p=buildSandboxCheckout(split,email,recipient)
 expect(p.subaccount).toBe(recipient.code);expect(p.transaction_charge).toBe(1000);expect(p.bearer).toBe('account')
 expect(()=>buildSandboxCheckout(split,email)).toThrow()
 expect(()=>buildSandboxCheckout(split,email,{...recipient,id:'other'})).toThrow()
 expect(()=>buildSandboxCheckout({...split,platformGrossMinor:999},email,recipient)).toThrow()
 expect(()=>buildSandboxCheckout(paymentIntentSnapshot({...base,purpose:'SUBSCRIPTION',totalMinor:0}),email)).toThrow()
})
test('initialization refuses redirects outside official checkout origin and mismatched references',()=>{
 const body={status:true,data:{reference:base.reference,authorization_url:'https://checkout.paystack.com/test'}}
 expect(parseSandboxInitialization(body,base.reference).environment).toBe('test')
 for(const url of ['http://checkout.paystack.com/test','https://checkout.paystack.com.evil.invalid/','https://other.invalid/'])expect(()=>parseSandboxInitialization({...body,data:{...body.data,authorization_url:url}},base.reference)).toThrow()
 expect(()=>parseSandboxInitialization(body,'other')).toThrow()
})
test('collection confirms exact test amount currency reference and recipient, never fulfills',()=>{
 const plan=buildSandboxCheckout(split,email,recipient)
 const data={domain:'test',status:'success',reference:plan.reference,amount:plan.amount,currency:'GHS',subaccount:{subaccount_code:recipient.code}}
 const result=parseSandboxCollection({status:true,data},plan)
 expect(result.allocation).toBe('REVIEW_REQUIRED');expect(result.fulfillmentEnabled).toBe(false)
 for(const patch of [{domain:'live'},{status:'pending'},{amount:9999},{currency:'NGN'},{reference:'other'},{subaccount:{subaccount_code:'ACCT_other'}}])expect(()=>parseSandboxCollection({status:true,data:{...data,...patch}},plan)).toThrow()
})
test('legacy test signatures validate exact bytes, reject tampering and live keys',()=>{
 const key='sk_test_synthetic',raw=Buffer.from('{"event":"charge.success"}'),signature=createHmac('sha512',key).update(raw).digest('hex')
 expect(verifyLegacySandboxSignature(raw,signature,key)).toBe(true)
 expect(verifyLegacySandboxSignature(Buffer.from('tampered'),signature,key)).toBe(false)
 expect(verifyLegacySandboxSignature(raw,signature,'sk_live_synthetic')).toBe(false)
 expect(verifyLegacySandboxSignature(raw,'bad',key)).toBe(false)
})
