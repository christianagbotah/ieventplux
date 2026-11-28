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


test('local expiry never promises stock release and disables checkout',async()=>{
 const {stockHoldLabel,canPrepareCheckout,inventoryHoldFingerprint}=await import('./marketplace-requests')
 const row={id:'request1',status:'ACKNOWLEDGED',totalMinor:2500,currency:'GHS',unitCount:3,createdAt:'2026-11-28T00:00:00Z',items:[],stockHold:{id:'hold1',status:'HELD' as const,expiresAt:'2026-11-28T00:30:00Z',releasedAt:null}}
 const history={requests:[row],seller:false,checkoutDraftEnabled:true,checkoutEnabled:false as const,inventoryReserved:false as const}
 const before=Date.parse('2026-11-28T00:29:59Z'),after=before+1000
 expect(stockHoldLabel(row.stockHold,before)).toBe('Reserved')
 expect(stockHoldLabel(row.stockHold,after)).toContain('awaiting server release')
 expect(stockHoldLabel({...row.stockHold,expiresAt:'invalid'},before)).toContain('awaiting server release')
 expect(canPrepareCheckout(history,row,before)).toBe(true)
 expect(canPrepareCheckout(history,row,after)).toBe(false)
 expect(canPrepareCheckout({...history,seller:true},row,before)).toBe(false)
 const released={...row,stockHold:{...row.stockHold,status:'EXPIRED' as const}}
 expect(stockHoldLabel(released.stockHold,after)).toBe('Expired · released')
 expect(inventoryHoldFingerprint(history)).not.toBe(inventoryHoldFingerprint({...history,requests:[released]}))
 expect(inventoryHoldFingerprint(history)).toBe(inventoryHoldFingerprint({...history,requests:[{...row,status:'REQUESTED'}]}))
})
