/** Internal matching policy only. A trusted service-area catalogue must supply
 * anchors. Never accept arbitrary public search coordinates or publish a home
 * address, exact distance, location history or a moving provider position. */
export type ServiceAreaAnchor={id:string;country:string;latitude:number;longitude:number}
export type ProviderAreaConsent={areaId:string;country:string;consentedAt:Date;revokedAt:Date|null}
function validAnchor(a:ServiceAreaAnchor){
 return !!a.id&&a.country==='GH'&&Number.isFinite(a.latitude)&&Number.isFinite(a.longitude)&&Math.abs(a.latitude)<=90&&Math.abs(a.longitude)<=180
}
export function matchServiceArea(consent:ProviderAreaConsent|null,providerArea:ServiceAreaAnchor,customerArea:ServiceAreaAnchor,now:Date){
 if(!consent||consent.revokedAt||!Number.isFinite(now.getTime())||!Number.isFinite(consent.consentedAt.getTime())||consent.consentedAt>now||consent.areaId!==providerArea.id||consent.country!==providerArea.country||!validAnchor(providerArea)||!validAnchor(customerArea)||providerArea.country!==customerArea.country)return null
 const rad=(n:number)=>n*Math.PI/180
 const a=Math.sin(rad(customerArea.latitude-providerArea.latitude)/2)**2+Math.cos(rad(providerArea.latitude))*Math.cos(rad(customerArea.latitude))*Math.sin(rad(customerArea.longitude-providerArea.longitude)/2)**2
 const km=6371*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,a))))
 if(km>25)return null
 // Coarse estimates between registered community anchors, not people or vehicles.
 return {areaId:providerArea.id,proximity:providerArea.id===customerArea.id?'SAME_AREA' as const:km<=10?'NEARBY_AREA' as const:'EXTENDED_AREA' as const}
}
