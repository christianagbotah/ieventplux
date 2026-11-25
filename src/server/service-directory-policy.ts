/** Wave 1 shared provider discovery policy. No dispatch, payment or credential
 * certification is implied. Call only with server-authoritative records. */
export const SERVICE_CATEGORIES = [
  {id:'TAXI',division:'MOVE',regulated:true},
  {id:'TROTRO',division:'MOVE',regulated:true},
  {id:'BUS_CHARTER',division:'MOVE',regulated:true},
  {id:'MOTORCYCLE_TRANSPORT',division:'MOVE',regulated:true},
  {id:'TRICYCLE_TRANSPORT',division:'MOVE',regulated:true},
  {id:'VEHICLE_RENTAL',division:'MOVE',regulated:true},
  {id:'TOWING',division:'MOVE',regulated:true},
  {id:'CARPENTRY',division:'SERVICES',regulated:false},
  {id:'CLEANING',division:'SERVICES',regulated:false},
  {id:'PLUMBING',division:'SERVICES',regulated:false},
  {id:'ELECTRICAL',division:'SERVICES',regulated:true},
  {id:'MECHANIC',division:'SERVICES',regulated:false},
  {id:'CATERING',division:'SERVICES',regulated:true},
  {id:'PHOTOGRAPHY',division:'SERVICES',regulated:false},
  {id:'EVENT_EQUIPMENT',division:'SERVICES',regulated:false},
  {id:'WATER_TANKER',division:'UTILITIES',regulated:true},
  {id:'WASTE_COLLECTION',division:'UTILITIES',regulated:true},
  {id:'SEPTIC_EVACUATION',division:'UTILITIES',regulated:true},
] as const
export type ServiceCategory = typeof SERVICE_CATEGORIES[number]['id']
export const AVAILABILITY_MAX_MS = 15 * 60 * 1000
export type ProviderDiscoveryRecord = {
  id:string; displayName:string; category:ServiceCategory; country:string;
  community:string; published:boolean; verified:boolean; jurisdictionApproved:boolean;
  credentialValidUntil:Date|null; state:'AVAILABLE'|'BUSY'|'OFFLINE'|'PAUSED';
  availableUntil:Date|null; lastConfirmedAt:Date|null;
}
export function publicProvider(record:ProviderDiscoveryRecord, country:string, now:Date){
  const category=SERVICE_CATEGORIES.find(c=>c.id===record.category)
  const time=now.getTime()
  if(!Number.isFinite(time)||!category||!record.published||!record.verified||!record.jurisdictionApproved||record.country!==country)return null
  if(category.regulated&&(!record.credentialValidUntil||!(record.credentialValidUntil.getTime()>time)))return null
  const last=record.lastConfirmedAt?.getTime()
  const available=record.state==='AVAILABLE'&&last!==undefined&&last<=time&&time-last<=AVAILABILITY_MAX_MS&&!!record.availableUntil&&record.availableUntil.getTime()>time
  // Explicit allowlist: never return private coordinates, documents or phone numbers.
  return {id:record.id,displayName:record.displayName,category:record.category,country:record.country,community:record.community,availability:available?'AVAILABLE' as const:'UNCONFIRMED' as const,lastConfirmedAt:available?record.lastConfirmedAt!.toISOString():null}
}
