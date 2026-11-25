import {expect,test} from 'bun:test'
import {initializeTestCheckout,verifyTestCollection,sandboxTransportKey} from './platform-paystack-transport'
import type {SandboxCheckoutPlan} from './platform-paystack-adapter'
const key='sk_test_synthetic'
const plan:SandboxCheckoutPlan={reference:'TEST-synthetic',currency:'GHS',amount:10000,email:'test@example.invalid',metadata:'{}'}
const fake=(callback:(url:string,init:RequestInit)=>Response)=>((url:string,init:RequestInit)=>Promise.resolve(callback(url,init))) as typeof fetch
test('transport requires explicit enablement and rejects live keys',()=>{
 expect(sandboxTransportKey({IEVENTPLUX_PAYSTACK_SANDBOX_ENABLED:'yes',MARKETPLACE_PAYSTACK_TEST_SECRET_KEY:key})).toBe(key)
 expect(()=>sandboxTransportKey({MARKETPLACE_PAYSTACK_TEST_SECRET_KEY:key})).toThrow()
 expect(()=>sandboxTransportKey({IEVENTPLUX_PAYSTACK_SANDBOX_ENABLED:'yes',MARKETPLACE_PAYSTACK_TEST_SECRET_KEY:'sk_live_bad'})).toThrow()
})
test('sandbox initialization sends only the fixed provider endpoint and never follows redirects',async()=>{
 const result=await initializeTestCheckout(plan,key,fake((url,init)=>{
  expect(url).toBe('https://api.paystack.co/transaction/initialize');expect(init.method).toBe('POST');expect(init.redirect).toBe('error');expect(JSON.parse(String(init.body))).toEqual(plan)
  return Response.json({status:true,data:{reference:plan.reference,authorization_url:'https://checkout.paystack.com/synthetic'}})
 }))
 expect(result.environment).toBe('test')
 await expect(initializeTestCheckout({...plan,reference:'ORD-live'},key)).rejects.toThrow()
 await expect(initializeTestCheckout(plan,'sk_live_bad')).rejects.toThrow()
})
test('verification checks provider identity and keeps fulfillment disabled',async()=>{
 const data={id:123,domain:'test',reference:plan.reference,amount:plan.amount,currency:'GHS',status:'success'}
 const result=await verifyTestCollection(plan,key,fake((url,init)=>{
  expect(url).toBe('https://api.paystack.co/transaction/verify/TEST-synthetic');expect(init.method).toBe('GET')
  return Response.json({status:true,data})
 }))
 expect(result.providerTransactionId).toBe('123');expect(result.fulfillmentEnabled).toBe(false)
 await expect(verifyTestCollection(plan,key,fake(()=>Response.json({status:true,data:{...data,id:undefined}})))).rejects.toThrow()
 await expect(verifyTestCollection(plan,key,fake(()=>Response.json({status:true,data:{...data,domain:'live'}})))).rejects.toThrow()
})
