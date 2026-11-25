import {expect,test} from 'bun:test'
import {publicProvider,SERVICE_CATEGORIES,type ProviderDiscoveryRecord} from './service-directory-policy'
const now=new Date('2026-11-25T12:00:00Z')
const p:ProviderDiscoveryRecord={id:'provider-1',displayName:'Example taxi',category:'TAXI',country:'GH',community:'Accra',published:true,verified:true,jurisdictionApproved:true,credentialValidUntil:new Date('2027-01-01'),state:'AVAILABLE',lastConfirmedAt:new Date('2026-11-25T11:55:00Z'),availableUntil:new Date('2026-11-25T12:10:00Z')}
test('discovery excludes unpublished, unverified, unapproved, expired or wrong-country providers',()=>{
 for(const patch of [{published:false},{verified:false},{jurisdictionApproved:false},{credentialValidUntil:null},{credentialValidUntil:new Date('2026-11-24')},{country:'NG'}])expect(publicProvider({...p,...patch},'GH',now)).toBeNull()
})
test('only fresh opted-in availability is visible, with no private information',()=>{
 const privateRecord={...p,latitude:5.6,longitude:-0.2,phone:'private',credential:'private'}
 const result=publicProvider(privateRecord,'GH',now)!
 expect(result.availability).toBe('AVAILABLE')
 expect(Object.keys(result).sort()).toEqual(['id','displayName','category','country','community','availability','lastConfirmedAt'].sort())
 for(const patch of [{state:'OFFLINE' as const},{state:'BUSY' as const},{lastConfirmedAt:new Date('2026-11-25T11:00:00Z')},{lastConfirmedAt:new Date('2026-11-25T12:05:00Z')},{availableUntil:now}])expect(publicProvider({...p,...patch},'GH',now)?.availability).toBe('UNCONFIRMED')
})
test('ordinary service taxonomy excludes healthcare, emergency dispatch and fuel',()=>{
 expect(SERVICE_CATEGORIES.some(c=>/FUEL|HOSPITAL|AMBULANCE|EMERGENCY/.test(c.id))).toBe(false)
 expect(SERVICE_CATEGORIES.find(c=>c.id==='MOTORCYCLE_TRANSPORT')?.regulated).toBe(true)
})
