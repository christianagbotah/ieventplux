/** Reviewed merchandise snapshot, never a confirmed order or a payment. */
export type PurchaseRequestRow={id:string;status:string;totalMinor:number;currency:string;unitCount:number;createdAt:string;
  items:{variantId:string;productName:string;variantTitle:string;quantity:number;unitPriceMinor:number;lineMinor:number;currency:string}[]}
export type PurchaseRequestHistory={requests:PurchaseRequestRow[];seller:boolean;checkoutEnabled:false;inventoryReserved:false}
export type ReviewedBasket={totalMinor:number;items:{variantId:string;quantity:number;unitPriceMinor:number}[]}
export function purchaseRequestBody(quote:ReviewedBasket,requestKey:string){
  return {requestKey,expectedTotalMinor:quote.totalMinor,items:quote.items.map(item=>({
    variantId:item.variantId,quantity:item.quantity,expectedUnitPriceMinor:item.unitPriceMinor,
  })).sort((a,b)=>a.variantId.localeCompare(b.variantId))}
}
export function purchaseRequestFingerprint(quote:ReviewedBasket){
  return JSON.stringify(purchaseRequestBody(quote,''))
}
export type PurchaseRequestResponse={request:PurchaseRequestRow;replayed:boolean;checkoutEnabled:false;inventoryReserved:false}

export type RequestDecision='ACKNOWLEDGED'|'DECLINED'|'WITHDRAWN'
export function requestStatusLabel(status:string){
 switch(status){
 case 'REQUESTED':return 'Requested · not confirmed'
 case 'ACKNOWLEDGED':return 'Seller acknowledged · not confirmed'
 case 'DECLINED':return 'Declined by seller'
 case 'WITHDRAWN':return 'Withdrawn by buyer'
 default:return 'Unknown status'
 }
}
export function availableRequestDecisions(seller:boolean,status:string):RequestDecision[]{
 if(status==='REQUESTED')return seller?['ACKNOWLEDGED','DECLINED']:['WITHDRAWN']
 if(status==='ACKNOWLEDGED')return seller?['DECLINED']:['WITHDRAWN']
 return []
}
export function decisionLabel(decision:RequestDecision){
 return decision==='ACKNOWLEDGED'?'Acknowledge request':decision==='DECLINED'?'Decline request':'Withdraw request'
}
