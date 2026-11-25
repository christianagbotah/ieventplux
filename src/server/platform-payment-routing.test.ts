import {expect,test} from 'bun:test'
import {planPlatformPayment,PLATFORM_PURPOSES,THIRD_PARTY_PURPOSES} from './platform-payment-routing'
const base={currency:'GHS',reference:'ORD-test',totalMinor:10000} as const
test('all platform-owned revenue routes directly to platform, no seller payable',()=>{
 for(const purpose of PLATFORM_PURPOSES){const p=planPlatformPayment({...base,purpose});expect(p.route).toBe('PLATFORM_DIRECT');expect(p.platformGrossMinor).toBe(10000);expect(p.beneficiaryGrossMinor).toBe(0);expect(p.executionEnabled).toBe(false)}
})
test('every third-party purpose conserves gross amounts and requires split certification',()=>{
 for(const purpose of THIRD_PARTY_PURPOSES){const kind=purpose==='FUNDRAISING'?'CAMPAIGN':['MARKETPLACE_GOODS','MARKETPLACE_SERVICE','DIGITAL_PRODUCT'].includes(purpose)?'STORE':'ORGANIZATION';const p=planPlatformPayment({...base,purpose,beneficiary:{kind,id:'test-owner'},commissionMinor:1000});expect(p.route).toBe('PROVIDER_SPLIT');expect(p.platformGrossMinor).toBe(1000);expect(p.beneficiaryGrossMinor).toBe(9000);expect(p.requiresProviderCertification).toBe(true);expect(p.executionEnabled).toBe(false)}
})
test('free tickets are not routed to a payment provider',()=>{
 const p=planPlatformPayment({...base,totalMinor:0,purpose:'EVENT_TICKET',beneficiary:{kind:'ORGANIZATION',id:'org'},commissionMinor:0});expect(p.route).toBe('FREE');expect(p.requiresProviderCertification).toBe(false)
})
test('reject missing rates, wrong recipients, fractional money and disguised platform revenue',()=>{
 expect(()=>planPlatformPayment({...base,purpose:'EVENT_TICKET',beneficiary:{kind:'ORGANIZATION',id:'org'}})).toThrow()
 expect(()=>planPlatformPayment({...base,purpose:'EVENT_TICKET',beneficiary:{kind:'STORE',id:'store'},commissionMinor:1000})).toThrow()
 expect(()=>planPlatformPayment({...base,purpose:'EVENT_TICKET',beneficiary:{kind:'ORGANIZATION',id:'org'},commissionMinor:10000})).toThrow()
 expect(()=>planPlatformPayment({...base,totalMinor:100.5,purpose:'SUBSCRIPTION'})).toThrow()
 expect(()=>planPlatformPayment({...base,purpose:'STORE_BOOST',beneficiary:{kind:'STORE',id:'store'}})).toThrow()
})
