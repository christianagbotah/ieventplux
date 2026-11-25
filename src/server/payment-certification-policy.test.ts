import {expect,test} from 'bun:test'
import {parseCertificationAction,certificationIdentity} from './payment-certification-policy'
const caseId='12345678-1234-4123-8123-123456789abc'
test('only explicit test actions and UUID v4 cases are allowed',()=>{
 const raw={action:'INITIALIZE',caseId,confirmTestOnly:true}
 expect(parseCertificationAction(raw).caseId).toBe(caseId)
 for(const patch of [{confirmTestOnly:false},{action:'LIVE'},{caseId:'ORD-live'},{amountMinor:99999},{recipient:'ACCT_other'}])expect(()=>parseCertificationAction({...raw,...patch})).toThrow()
})
test('test case is owner scoped with fixed amount and separate reference namespace',()=>{
 const a=certificationIdentity('finance-a',caseId),b=certificationIdentity('finance-b',caseId)
 expect(a.sourceId).not.toBe(b.sourceId)
 expect(a.reference.startsWith('TEST-DIRECT-')).toBe(true)
 expect(a.totalMinor).toBe(100)
 expect(a.pricingVersion).toBe('certification-direct-v1')
})
