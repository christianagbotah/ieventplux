import {SERVICE_CATEGORIES,AVAILABILITY_MAX_MS,type ServiceCategory,type ProviderDiscoveryRecord} from './service-directory-policy'
export type ProviderState={category:string;country:string;reviewStatus:string;published:boolean;jurisdictionApproved:boolean;credentialValidUntil:Date|null;availabilityState:string;availableUntil:Date|null;lastConfirmedAt:Date|null}
const inactive={availabilityState:'OFFLINE',availableUntil:null,lastConfirmedAt:null}
export function eligibleProvider(p:ProviderState,now:Date){
 const cat=SERVICE_CATEGORIES.find(c=>c.id===p.category)
 return !!cat&&p.country==='GH'&&p.reviewStatus==='APPROVED'&&p.jurisdictionApproved&&(!cat.regulated||!!p.credentialValidUntil&&p.credentialValidUntil>now)
}
export function reviewProvider(p:ProviderState,raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid review')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==3||!['decision','reason','attested'].every(k=>Object.prototype.hasOwnProperty.call(x,k))||x.attested!==true||typeof x.reason!=='string'||x.reason.trim().length<10||x.reason.length>500)throw new Error('Review and reason required')
 const cat=SERVICE_CATEGORIES.find(c=>c.id===p.category)
 if(!cat||p.country!=='GH')throw new Error('Unsupported pilot category')
 if(x.decision==='APPROVE'&&p.reviewStatus==='PENDING'&&!cat.regulated)return {reviewStatus:'APPROVED',jurisdictionApproved:true,published:false,...inactive}
 if(x.decision==='REJECT'&&p.reviewStatus==='PENDING')return {reviewStatus:'REJECTED',jurisdictionApproved:false,published:false,...inactive}
 if(x.decision==='SUSPEND'&&p.reviewStatus==='APPROVED')return {reviewStatus:'SUSPENDED',jurisdictionApproved:false,published:false,...inactive}
 throw new Error('Review is unavailable; regulated categories require credential certification')
}
export function ownerProviderAction(p:ProviderState,raw:unknown,now:Date){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid action')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==1||!Object.prototype.hasOwnProperty.call(x,'action'))throw new Error('Unexpected fields')
 if(x.action==='UNPUBLISH')return {published:false,...inactive}
 if(x.action==='OFFLINE')return inactive
 if(!eligibleProvider(p,now))throw new Error('Approved eligible listing required')
 if(x.action==='PUBLISH')return {published:true,...inactive}
 if(!p.published)throw new Error('Publish first')
 if(x.action==='AVAILABLE')return {availabilityState:'AVAILABLE',lastConfirmedAt:now,availableUntil:new Date(now.getTime()+AVAILABILITY_MAX_MS)}
 if(x.action==='BUSY'||x.action==='PAUSED')return {availabilityState:x.action,availableUntil:null,lastConfirmedAt:null}
 throw new Error('Invalid action')
}
export function discoveryRecord(p:ProviderState&{id:string;displayName:string;community:string}):ProviderDiscoveryRecord{
 const state=['AVAILABLE','BUSY','OFFLINE','PAUSED'].includes(p.availabilityState)?p.availabilityState:'OFFLINE'
 return {id:p.id,displayName:p.displayName,category:p.category as ServiceCategory,country:p.country,community:p.community,published:p.published,verified:p.reviewStatus==='APPROVED',jurisdictionApproved:p.jurisdictionApproved,credentialValidUntil:p.credentialValidUntil,state:state as ProviderDiscoveryRecord['state'],availableUntil:p.availableUntil,lastConfirmedAt:p.lastConfirmedAt}
}
