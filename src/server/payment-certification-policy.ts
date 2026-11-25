export const CERTIFICATION_PRICE_VERSION='certification-direct-v1'
export const CERTIFICATION_AMOUNT_MINOR=100
export function parseCertificationAction(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid certification action.')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==3||!['INITIALIZE','VERIFY'].includes(String(x.action))||x.confirmTestOnly!==true||typeof x.caseId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x.caseId))throw new Error('Confirm a valid test-only certification case.')
 return {action:x.action as 'INITIALIZE'|'VERIFY',caseId:x.caseId}
}
export function certificationIdentity(userId:string,caseId:string){
 return {sourceId:'cert:'+userId+':'+caseId,reference:'TEST-DIRECT-'+caseId,purpose:'SUBSCRIPTION' as const,pricingVersion:CERTIFICATION_PRICE_VERSION,currency:'GHS' as const,totalMinor:CERTIFICATION_AMOUNT_MINOR}
}
