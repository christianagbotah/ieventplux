import {test,expect} from 'bun:test'
import {parseServiceProviderEnrollment} from './service-provider-enrollment'
const valid={category:'TAXI',country:'GH',community:'  Dzodze  ',displayName:'Example Taxi',serviceDescription:'Local taxi and scheduled pickup'}
test('Ghana pilot enrollment accepts only reviewed profile fields',()=>{
 expect(parseServiceProviderEnrollment(valid).community).toBe('Dzodze')
 for(const patch of [{published:true},{ownerId:'other'},{reviewStatus:'APPROVED'},{jurisdictionApproved:true},{latitude:5.6},{credentialValidUntil:'2027-01-01'}])expect(()=>parseServiceProviderEnrollment({...valid,...patch})).toThrow()
})
test('unsupported country, private control characters and separate regulated domains fail closed',()=>{
 for(const patch of [{country:'NG'},{category:'FUEL'},{category:'AMBULANCE'},{category:'HOSPITAL'},{displayName:'x'},{community:'\n'},{serviceDescription:'short'},{displayName:'foo\u0000bar'}])expect(()=>parseServiceProviderEnrollment({...valid,...patch})).toThrow()
})
