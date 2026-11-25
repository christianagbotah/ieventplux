import {expect,test} from 'bun:test'
import {purchaseRequestBody,purchaseRequestFingerprint} from './marketplace-requests'
const a={variantId:'variant01',quantity:2,unitPriceMinor:1000}
const b={variantId:'variant02',quantity:1,unitPriceMinor:500}
const quote={totalMinor:2500,items:[a,b]}
test('purchase request submits reviewed prices only and canonical item ordering',()=>{
 expect(purchaseRequestBody({...quote,items:[b,a]},'unique-request-key')).toEqual({
  requestKey:'unique-request-key',expectedTotalMinor:2500,items:[
   {variantId:'variant01',quantity:2,expectedUnitPriceMinor:1000},{variantId:'variant02',quantity:1,expectedUnitPriceMinor:500}]})
 expect(purchaseRequestFingerprint(quote)).toBe(purchaseRequestFingerprint({...quote,items:[b,a]}))
 expect(purchaseRequestFingerprint(quote)).not.toBe(purchaseRequestFingerprint({...quote,items:[{...a,unitPriceMinor:1100},{...b,unitPriceMinor:300}]}))
})
