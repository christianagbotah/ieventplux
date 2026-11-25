import {test,expect} from 'bun:test'
import {providerIntakeEnabled,parseDocumentKind,screeningDecision} from './provider-credential-intake-policy'
test('intake explicitly gated, no implicit enablement',()=>{
 expect(providerIntakeEnabled({})).toBe(false)
 expect(providerIntakeEnabled({IEVENTPLUX_PROVIDER_DOCUMENT_INTAKE_ENABLED:'yes'})).toBe(false)
 expect(providerIntakeEnabled({IEVENTPLUX_PROVIDER_DOCUMENT_INTAKE_ENABLED:'yes',KYC_PRIVATE_DIR:'/private/test'})).toBe(true)
})
test('only applicable regulated credential family and express consent',()=>{
 expect(parseDocumentKind('TAXI','VEHICLE_AUTHORIZATION','yes')).toBe('VEHICLE_AUTHORIZATION')
 for(const [c,k,v] of [['TAXI','UTILITY_AUTHORIZATION','yes'],['CARPENTRY','IDENTITY_FRONT','yes'],['TAXI','IDENTITY_FRONT','no']])expect(()=>parseDocumentKind(c,k,v)).toThrow()
})
test('screening never equals certification and cannot be self-approved',()=>{
 expect(screeningDecision({decision:'SCREENED',attested:true},'owner','reviewer','PENDING')).toBe('SCREENED')
 for(const x of [{decision:'VERIFIED',attested:true},{decision:'APPROVED',attested:true},{decision:'SCREENED',attested:false},{decision:'SCREENED',attested:true,validUntil:'2027-01-01'}])expect(()=>screeningDecision(x,'owner','reviewer','PENDING')).toThrow()
 expect(()=>screeningDecision({decision:'SCREENED',attested:true},'owner','owner','PENDING')).toThrow()
})
