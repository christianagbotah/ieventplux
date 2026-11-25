import {expect,test} from 'bun:test'
import {eligibleOrganizationSettlement,canRequestOrganizationSettlement} from './organization-settlement-policy'
const eligible={country:'GH',status:'ACTIVE',verifiedAt:new Date(),verification:{status:'APPROVED'}}
test('active Ghana organizations require approved identity verification',()=>{
 expect(eligibleOrganizationSettlement(eligible)).toBe(true)
 for(const patch of [{country:'NG'},{status:'SUSPENDED'},{verifiedAt:null},{verification:null},{verification:{status:'PENDING'}}])expect(eligibleOrganizationSettlement({...eligible,...patch})).toBe(false)
})
test('only the actual verified active owner may request',()=>{
 expect(canRequestOrganizationSettlement(eligible,'owner','owner','OWNER',true,'ACTIVE')).toBe(true)
 expect(canRequestOrganizationSettlement(eligible,'owner','other','OWNER',true,'ACTIVE')).toBe(false)
 expect(canRequestOrganizationSettlement(eligible,'owner','owner','ADMIN',true,'ACTIVE')).toBe(false)
 expect(canRequestOrganizationSettlement(eligible,'owner','owner','OWNER',false,'ACTIVE')).toBe(false)
 expect(canRequestOrganizationSettlement(eligible,'owner','owner','OWNER',true,'SUSPENDED')).toBe(false)
})
