import {SERVICE_CATEGORIES,type ServiceCategory} from './service-directory-policy'
// Proposed platform evidence families, NOT a statement of statutory requirements.
// A separately verified jurisdiction-specific rule set must be configured first.
export type EvidenceKind='IDENTITY'|'OPERATOR_AUTHORIZATION'|'VEHICLE_AUTHORIZATION'|'INSURANCE'|'TRADE_AUTHORIZATION'|'UTILITY_AUTHORIZATION'
export type CredentialEvidence={kind:EvidenceKind;reviewStatus:'PENDING'|'VERIFIED'|'REJECTED';validUntil:Date;reviewerId:string;subjectOwnerId:string;ruleVersion:string}
export type CredentialRule={country:string;category:ServiceCategory;version:string;certified:boolean;required:EvidenceKind[]}
export function credentialGate(category:ServiceCategory,ownerId:string,rule:CredentialRule|null,evidence:CredentialEvidence[],now:Date){
 const cat=SERVICE_CATEGORIES.find(c=>c.id===category)
 if(!cat||!cat.regulated||!ownerId||!Number.isFinite(now.getTime())||!rule?.certified||rule.country!=='GH'||rule.category!==category||!rule.version||!rule.required.includes('IDENTITY')||rule.required.length<2)return {eligible:false,validUntil:null}
 const matches=rule.required.map(kind=>evidence.filter(e=>e.kind===kind&&e.subjectOwnerId===ownerId&&e.ruleVersion===rule.version&&e.reviewStatus==='VERIFIED'&&!!e.reviewerId&&e.reviewerId!==ownerId&&e.validUntil>now).sort((a,b)=>b.validUntil.getTime()-a.validUntil.getTime())[0])
 if(matches.some(e=>!e))return {eligible:false,validUntil:null}
 return {eligible:true,validUntil:new Date(Math.min(...matches.map(e=>e!.validUntil.getTime())))}
}
