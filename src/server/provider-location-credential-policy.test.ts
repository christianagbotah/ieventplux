import {test,expect} from 'bun:test'
import {matchServiceArea} from './provider-location-policy'
import {credentialGate,type CredentialRule,type CredentialEvidence} from './provider-credential-policy'
const now=new Date('2026-11-25T12:00:00Z')
const area={id:'area-a',country:'GH',latitude:5.6,longitude:-0.2}
const nearby={id:'area-b',country:'GH',latitude:5.63,longitude:-0.2}
const consent={areaId:area.id,country:'GH',consentedAt:new Date('2026-11-24'),revokedAt:null}
test('only consented service-area anchors produce coarse estimates',()=>{
 expect(matchServiceArea(consent,area,nearby,now)).toEqual({areaId:'area-a',proximity:'NEARBY_AREA'})
 expect(matchServiceArea(null,area,nearby,now)).toBeNull()
 expect(matchServiceArea({...consent,revokedAt:now},area,nearby,now)).toBeNull()
 expect(matchServiceArea(consent,area,{...nearby,latitude:8},now)).toBeNull()
 expect(matchServiceArea(consent,area,{...nearby,latitude:NaN},now)).toBeNull()
 expect(matchServiceArea(consent,area,{...nearby,country:'NG'},now)).toBeNull()
})
test('regulated provider requires certified rule, independent review and current evidence',()=>{
 const rule:CredentialRule={country:'GH',category:'TAXI',version:'synthetic-test-v1',certified:true,required:['IDENTITY','OPERATOR_AUTHORIZATION']}
 const evidence:CredentialEvidence[]=rule.required.map((kind,i)=>({kind,reviewStatus:'VERIFIED',reviewerId:'reviewer',subjectOwnerId:'owner',ruleVersion:rule.version,validUntil:new Date(i?'2027-01-01':'2027-02-01')}))
 expect(credentialGate('TAXI','owner',null,evidence,now).eligible).toBe(false)
 expect(credentialGate('TAXI','owner',{...rule,certified:false},evidence,now).eligible).toBe(false)
 expect(credentialGate('TAXI','owner',rule,evidence.slice(0,1),now).eligible).toBe(false)
 expect(credentialGate('TAXI','owner',rule,evidence.map(e=>({...e,reviewerId:'owner'})),now).eligible).toBe(false)
 expect(credentialGate('TAXI','owner',rule,evidence.map(e=>({...e,validUntil:now})),now).eligible).toBe(false)
 expect(credentialGate('TAXI','owner',rule,evidence,now)).toEqual({eligible:true,validUntil:new Date('2027-01-01')})
})
