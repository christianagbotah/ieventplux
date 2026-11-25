import {expect,test} from 'bun:test'
import {paymentIntentSnapshot,requireMatchingIntent,type IntentInput} from './platform-payment-intent'
const base:IntentInput={purpose:'EVENT_TICKET',sourceId:'order-1',reference:'ORD-1',currency:'GHS',totalMinor:10000,commissionMinor:1000,beneficiary:{kind:'ORGANIZATION',id:'org-1'},pricingVersion:'fee-v1'}
test('stable immutable snapshot conserves amount and supports safe replay',()=>{
 const a=paymentIntentSnapshot(base),b=paymentIntentSnapshot({...base})
 expect(a).toEqual(b);expect(a.status).toBe('PLANNED');expect(a.platformGrossMinor+a.beneficiaryGrossMinor).toBe(a.totalMinor)
 expect(()=>requireMatchingIntent(a,b)).not.toThrow()
})
test('reject replay with altered commission, source, price version, reference or beneficiary',()=>{
 const a=paymentIntentSnapshot(base)
 for(const patch of [{commissionMinor:500},{sourceId:'order-2'},{pricingVersion:'fee-v2'},{reference:'ORD-2'},{beneficiary:{kind:'ORGANIZATION' as const,id:'org-2'}}]){
  expect(()=>requireMatchingIntent(a,paymentIntentSnapshot({...base,...patch}))).toThrow()
 }
})
test('souvenir can have its own store beneficiary but ticket cannot',()=>{
 expect(paymentIntentSnapshot({...base,purpose:'EVENT_SOUVENIR',beneficiary:{kind:'STORE',id:'shop-1'}}).beneficiaryKind).toBe('STORE')
 expect(()=>paymentIntentSnapshot({...base,beneficiary:{kind:'STORE',id:'shop-1'}})).toThrow()
})
test('reject blank source and pricing version',()=>{
 expect(()=>paymentIntentSnapshot({...base,sourceId:''})).toThrow()
 expect(()=>paymentIntentSnapshot({...base,pricingVersion:' '})).toThrow()
})
