import {SERVICE_CATEGORIES} from './service-directory-policy'
export const DOCUMENT_KINDS=['IDENTITY_FRONT','IDENTITY_BACK','OPERATOR_AUTHORIZATION','VEHICLE_AUTHORIZATION','INSURANCE','TRADE_AUTHORIZATION','UTILITY_AUTHORIZATION'] as const
export type ProviderDocumentKind=typeof DOCUMENT_KINDS[number]
export const MAX_PROVIDER_DOCUMENTS=10
export function providerIntakeEnabled(env:Record<string,string|undefined>){
 return env.IEVENTPLUX_PROVIDER_DOCUMENT_INTAKE_ENABLED==='yes'&&!!env.KYC_PRIVATE_DIR&&env.KYC_PRIVATE_DIR.startsWith('/')
}
export function parseDocumentKind(category:string,kind:unknown,consent:unknown):ProviderDocumentKind{
 const c=SERVICE_CATEGORIES.find(x=>x.id===category)
 if(!c?.regulated||consent!=='yes'||!DOCUMENT_KINDS.some(k=>k===kind))throw new Error('Regulated provider and explicit consent required')
 const allowed=c.division==='MOVE'?['OPERATOR_AUTHORIZATION','VEHICLE_AUTHORIZATION','INSURANCE']:c.division==='UTILITIES'?['UTILITY_AUTHORIZATION','OPERATOR_AUTHORIZATION','VEHICLE_AUTHORIZATION','INSURANCE']:['TRADE_AUTHORIZATION','INSURANCE']
 if(kind!=='IDENTITY_FRONT'&&kind!=='IDENTITY_BACK'&&!allowed.includes(String(kind)))throw new Error('Document category not applicable')
 return kind as ProviderDocumentKind
}
export function screeningDecision(raw:unknown,ownerId:string,reviewerId:string,status:string){
 if(!ownerId||!reviewerId||ownerId===reviewerId||status!=='PENDING'||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Independent pending review required')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==2||x.attested!==true||!['SCREENED','REJECTED'].includes(String(x.decision)))throw new Error('Confirm screening decision')
 return x.decision as 'SCREENED'|'REJECTED'
}
