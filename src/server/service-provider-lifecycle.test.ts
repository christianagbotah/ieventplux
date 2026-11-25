import {test,expect} from 'bun:test'
import {reviewProvider,ownerProviderAction,eligibleProvider,discoveryRecord,type ProviderState} from './service-provider-lifecycle'
import {publicProvider} from './service-directory-policy'
const now=new Date('2026-11-25T12:00:00Z')
const pending:ProviderState={category:'CARPENTRY',country:'GH',reviewStatus:'PENDING',published:false,jurisdictionApproved:false,credentialValidUntil:null,availabilityState:'OFFLINE',availableUntil:null,lastConfirmedAt:null}
const approved={...pending,...reviewProvider(pending,{decision:'APPROVE',reason:'Independent pilot review',attested:true})}
test('pending or regulated providers cannot be approved or self-published through the pilot',()=>{
 expect(()=>reviewProvider({...pending,category:'TAXI'},{decision:'APPROVE',reason:'Manual approval',attested:true})).toThrow()
 expect(()=>reviewProvider(pending,{decision:'APPROVE',reason:'Manual approval',attested:false})).toThrow()
 expect(()=>ownerProviderAction(pending,{action:'PUBLISH'},now)).toThrow()
 expect(()=>ownerProviderAction(approved,{action:'AVAILABLE'},now)).toThrow()
 expect(()=>ownerProviderAction(approved,{action:'PUBLISH',reviewStatus:'APPROVED'},now)).toThrow()
})
test('owner opts into publication and availability expires automatically',()=>{
 const published={...approved,...ownerProviderAction(approved,{action:'PUBLISH'},now)}
 const available={...published,...ownerProviderAction(published,{action:'AVAILABLE'},now),id:'p1',displayName:'Carpenter',community:'Dzodze'}
 expect(eligibleProvider(available,now)).toBe(true)
 expect(publicProvider(discoveryRecord(available),'GH',now)?.availability).toBe('AVAILABLE')
 expect(publicProvider(discoveryRecord(available),'GH',new Date(now.getTime()+900001))?.availability).toBe('UNCONFIRMED')
 expect(publicProvider(discoveryRecord({...available,...ownerProviderAction(available,{action:'UNPUBLISH'},now)}),'GH',now)).toBeNull()
 expect(publicProvider(discoveryRecord({...available,...reviewProvider(available,{decision:'SUSPEND',reason:'Verified policy concern',attested:true})}),'GH',now)).toBeNull()
})
