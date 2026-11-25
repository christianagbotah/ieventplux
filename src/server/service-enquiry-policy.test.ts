import {test,expect} from 'bun:test'
import {parseEnquiry,enquiryDecision} from './service-enquiry-policy'
const now=new Date('2026-11-25T12:00:00Z')
const pending={status:'REQUESTED',quoteExpiresAt:null}
const quote={action:'QUOTE',quoteMinor:15000,quoteNote:'Includes labour only'}
test('strict private enquiry payload excludes forged status, GPS or pricing',()=>{
 const raw={providerId:'p1',requestKey:'request-1234567890',description:'Repair a wooden door',community:'Dzodze'}
 expect(parseEnquiry(raw).community).toBe('Dzodze')
 for(const patch of [{customerId:'other'},{status:'QUOTE_ACCEPTED'},{latitude:5.6},{quoteMinor:1},{description:'short'}])expect(()=>parseEnquiry({...raw,...patch})).toThrow()
})
test('provider quotes once; customer accepts only a current quote',()=>{
 const made=enquiryDecision('PROVIDER',pending,quote,now)
 expect(made.status).toBe('QUOTED')
 expect(made.quoteMinor).toBe(15000)
 const row={status:'QUOTED',quoteExpiresAt:made.quoteExpiresAt!}
 expect(enquiryDecision('CUSTOMER',row,{action:'ACCEPT_QUOTE'},now).status).toBe('QUOTE_ACCEPTED')
 expect(()=>enquiryDecision('CUSTOMER',row,{action:'ACCEPT_QUOTE'},new Date(now.getTime()+86400000))).toThrow()
 expect(()=>enquiryDecision('PROVIDER',row,quote,now)).toThrow()
 expect(()=>enquiryDecision('CUSTOMER',pending,quote,now)).toThrow()
 expect(()=>enquiryDecision('PROVIDER',pending,{...quote,quoteMinor:1.5},now)).toThrow()
 expect(()=>enquiryDecision('CUSTOMER',pending,{action:'ACCEPT_QUOTE'},now)).toThrow()
 expect(enquiryDecision('CUSTOMER',row,{action:'WITHDRAW'},now).status).toBe('WITHDRAWN')
})
