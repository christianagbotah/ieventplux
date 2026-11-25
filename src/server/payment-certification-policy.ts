export const CERTIFICATION_PRICE_VERSION='certification-direct-v1'
export const SPLIT_CERTIFICATION_PRICE_VERSION='certification-split-v1'
export const CERTIFICATION_AMOUNT_MINOR=100
export const SPLIT_CERTIFICATION_AMOUNT_MINOR=10000
export const SPLIT_CERTIFICATION_COMMISSION_MINOR=1000
export type CertificationMode='DIRECT'|'STORE'|'ORGANIZATION'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function parseCertificationAction(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid certification action.')
 const x=raw as Record<string,unknown>
 const mode=x.mode??'DIRECT'
 if((x.action!=='INITIALIZE'&&x.action!=='VERIFY')||(mode!=='DIRECT'&&mode!=='STORE'&&mode!=='ORGANIZATION')||x.confirmTestOnly!==true||typeof x.caseId!=='string'||!UUID.test(x.caseId)||Object.keys(x).some(k=>!['action','caseId','confirmTestOnly','mode','beneficiaryId'].includes(k)))throw new Error('Confirm a valid test-only certification case.')
 const needsRecipient=x.action==='INITIALIZE'&&mode!=='DIRECT'
 if(needsRecipient?(typeof x.beneficiaryId!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(x.beneficiaryId)):('beneficiaryId' in x))throw new Error('Select an eligible beneficiary only for split initialization.')
 return {action:x.action,caseId:x.caseId,mode:mode as CertificationMode,beneficiaryId:needsRecipient?x.beneficiaryId as string:undefined}
}
export function certificationIdentity(userId:string,caseId:string){
 return {sourceId:'cert:'+userId+':'+caseId,reference:'TEST-DIRECT-'+caseId,purpose:'SUBSCRIPTION' as const,pricingVersion:CERTIFICATION_PRICE_VERSION,currency:'GHS' as const,totalMinor:CERTIFICATION_AMOUNT_MINOR}
}
export function splitCertificationIdentity(userId:string,caseId:string,mode:'STORE'|'ORGANIZATION',beneficiaryId:string){
 return {sourceId:'cert:'+userId+':'+caseId,reference:'TEST-'+mode+'-'+caseId,purpose:mode==='STORE'?'MARKETPLACE_GOODS' as const:'EVENT_TICKET' as const,pricingVersion:SPLIT_CERTIFICATION_PRICE_VERSION,currency:'GHS' as const,totalMinor:SPLIT_CERTIFICATION_AMOUNT_MINOR,commissionMinor:SPLIT_CERTIFICATION_COMMISSION_MINOR,beneficiary:{kind:mode,id:beneficiaryId}}
}
