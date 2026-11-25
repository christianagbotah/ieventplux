export type SettlementEligibility={country:string;status:string;verifiedAt:Date|null;verification:{status:string}|null}
export function eligibleOrganizationSettlement(org:SettlementEligibility){
 return org.country==='GH'&&org.status==='ACTIVE'&&!!org.verifiedAt&&org.verification?.status==='APPROVED'
}
export function canRequestOrganizationSettlement(org:SettlementEligibility,ownerId:string,userId:string,role:string,emailVerified:boolean,userStatus:string){
 return eligibleOrganizationSettlement(org)&&ownerId===userId&&role==='OWNER'&&emailVerified&&userStatus==='ACTIVE'
}
