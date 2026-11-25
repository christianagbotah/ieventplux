import {expect,test} from 'bun:test'
import {assertReviewedPrices,parsePurchaseRequest} from './marketplace-request-policy'
const a={variantId:'variant0001',quantity:2,expectedUnitPriceMinor:1000}
const b={variantId:'variant0002',quantity:1,expectedUnitPriceMinor:500}
const raw={items:[a,b],expectedTotalMinor:2500,requestKey:'test-request-key-001'}
test('purchase request is strict and canonical for idempotent replay',()=>{
  const input=parsePurchaseRequest(raw)
  expect(parsePurchaseRequest({...raw,items:[b,a]}).fingerprint).toBe(input.fingerprint)
  for(const invalid of [{...raw,buyerId:'other'},{...raw,expectedTotalMinor:1},{...raw,items:[a,a]},{...raw,requestKey:'short'},{...raw,items:[{...a,stock:10},b]}])
    expect(()=>parsePurchaseRequest(invalid)).toThrow()
})
test('price swaps are rejected even when the total is unchanged',()=>{
  const input=parsePurchaseRequest(raw)
  expect(()=>assertReviewedPrices(input,{totalMinor:2500,items:[{variantId:a.variantId,unitPriceMinor:1100},{variantId:b.variantId,unitPriceMinor:300}]})).toThrow()
  expect(()=>assertReviewedPrices(input,{totalMinor:2500,items:[{variantId:a.variantId,unitPriceMinor:1000},{variantId:b.variantId,unitPriceMinor:500}]})).not.toThrow()
})

test('request decision policy preserves terminal states and role boundaries',async()=>{
 const {decisionAllowed,parseRequestDecision}=await import('./marketplace-request-policy')
 expect(parseRequestDecision({status:'ACKNOWLEDGED'})).toBe('ACKNOWLEDGED')
 for(const raw of [{status:'PAID'},{status:'ACKNOWLEDGED',buyerId:'other'},{status:['DECLINED']},null])expect(()=>parseRequestDecision(raw)).toThrow()
 expect(decisionAllowed('seller','REQUESTED','ACKNOWLEDGED')).toBe(true)
 expect(decisionAllowed('seller','REQUESTED','DECLINED')).toBe(true)
 expect(decisionAllowed('buyer','REQUESTED','WITHDRAWN')).toBe(true)
 expect(decisionAllowed('buyer','ACKNOWLEDGED','WITHDRAWN')).toBe(true)
 expect(decisionAllowed('seller','ACKNOWLEDGED','DECLINED')).toBe(true)
 expect(decisionAllowed('seller','DECLINED','DECLINED')).toBe(true)
 expect(decisionAllowed('seller','WITHDRAWN','ACKNOWLEDGED')).toBe(false)
 expect(decisionAllowed('buyer','DECLINED','WITHDRAWN')).toBe(false)
 expect(decisionAllowed('buyer','REQUESTED','ACKNOWLEDGED')).toBe(false)
 expect(decisionAllowed('seller','REQUESTED','WITHDRAWN')).toBe(false)
})
