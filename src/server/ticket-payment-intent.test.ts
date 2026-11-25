import {expect,test} from 'bun:test'
import {ticketOrderShadowIntent} from './ticket-payment-intent'
const order={id:'order-1',reference:'ORD-ONE',orgId:'org-1',kind:'PAID',currency:'GHS',totalMinor:10000,platformFeeMinor:1000,feeVersionId:'v1',feeSnapshot:JSON.stringify({feeVersionId:'v1',currency:'GHS',ticketCommissionBp:1000})}
test('actual order amounts create a non-executable shadow allocation with distinct namespace',()=>{
 const plan=ticketOrderShadowIntent(order)!
 expect(plan.reference).toBe('PLAN-ORD-ONE');expect(plan.sourceId).toBe(order.id);expect(plan.status).toBe('PLANNED');expect(plan.pricingVersion).toBe('legacy-shadow:v1')
 expect(plan.platformGrossMinor).toBe(1000);expect(plan.beneficiaryGrossMinor).toBe(9000);expect(plan.beneficiaryId).toBe('org-1')
})
test('free and unsupported legacy orders do not change their checkout behavior',()=>{
 for(const patch of [{kind:'FREE'},{currency:'USD'},{totalMinor:0},{totalMinor:100_000_001},{platformFeeMinor:10000},{platformFeeMinor:999},{feeSnapshot:'{}'},{feeVersionId:null}])expect(ticketOrderShadowIntent({...order,...patch})).toBeNull()
})
