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

test('request actions respect seller and buyer roles and terminal states',async()=>{
 const {availableRequestDecisions,requestStatusLabel}=await import('./marketplace-requests')
 expect(availableRequestDecisions(true,'REQUESTED')).toEqual(['ACKNOWLEDGED','DECLINED'])
 expect(availableRequestDecisions(false,'REQUESTED')).toEqual(['WITHDRAWN'])
 expect(availableRequestDecisions(true,'ACKNOWLEDGED')).toEqual(['DECLINED'])
 expect(availableRequestDecisions(false,'WITHDRAWN')).toEqual([])
 expect(availableRequestDecisions(true,'DECLINED')).toEqual([])
 expect(requestStatusLabel('ACKNOWLEDGED')).toContain('not confirmed')
})

import {checkoutReviewStillCurrent,type PurchaseRequestRow} from './marketplace-requests'
test('live review invalidates on changed or removed reservation',()=>{const row:PurchaseRequestRow={id:'request',status:'ACKNOWLEDGED',totalMinor:100,currency:'GHS',unitCount:1,createdAt:'2026-11-27',items:[],stockHold:{id:'hold',status:'HELD',expiresAt:'2026-11-27T12:30:00Z',releasedAt:null}};expect(checkoutReviewStillCurrent(row,{...row})).toBe(true);expect(checkoutReviewStillCurrent(row,{...row,status:'WITHDRAWN'})).toBe(false);expect(checkoutReviewStillCurrent(row,{...row,stockHold:{...row.stockHold!,status:'EXPIRED'}})).toBe(false);expect(checkoutReviewStillCurrent(row,undefined)).toBe(false)})
