/** Reviewed merchandise snapshot, never a confirmed order or a payment. */
export type CheckoutDraft={id:string;status:'PREPARED'|'RELEASED'|'EXPIRED';totalMinor:number;currency:string;unitCount:number;closedAt:string|null}
export type StockHold={id:string;status:'HELD'|'RELEASED'|'EXPIRED';expiresAt:string;releasedAt:string|null;checkoutDraft?:CheckoutDraft|null}
export type PurchaseRequestRow={id:string;status:string;totalMinor:number;currency:string;unitCount:number;createdAt:string;stockHold?:StockHold|null;
  items:{variantId:string;productName:string;variantTitle:string;quantity:number;unitPriceMinor:number;lineMinor:number;currency:string}[]}
export type PurchaseRequestHistory={requests:PurchaseRequestRow[];seller:boolean;stockHoldEnabled?:boolean;checkoutDraftEnabled?:boolean;checkoutEnabled:false;inventoryReserved:false}
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

export function canPrepareCheckout(history:PurchaseRequestHistory|null,row:PurchaseRequestRow,now=Date.now()){return !!history?.checkoutDraftEnabled&&!history.seller&&row.status==='ACKNOWLEDGED'&&row.stockHold?.status==='HELD'&&Date.parse(row.stockHold.expiresAt)>now&&!row.stockHold.checkoutDraft}

/** The client cannot declare inventory released; only the server can close a hold. */
export function stockHoldLabel(hold:StockHold,now=Date.now()){
 if(hold.status==='RELEASED')return 'Released'
 if(hold.status==='EXPIRED')return 'Expired · released'
 const expiry=Date.parse(hold.expiresAt)
 return !Number.isFinite(expiry)||expiry<=now?'Expiry reached · awaiting server release':'Reserved'
}
export function inventoryHoldFingerprint(history:PurchaseRequestHistory){
 return JSON.stringify(history.requests.filter(r=>r.stockHold).map(r=>[r.id,r.stockHold!.id,r.stockHold!.status] as const).sort((a,b)=>a[0].localeCompare(b[0])))
}

export type CheckoutReview={currency:'GHS';totalMinor:number;unitCount:number;holdValid:boolean;catalogueCurrent:boolean;expiresAt:string|null;methods:('MOBILE_MONEY'|'CARD'|'CASH')[];checkoutEnabled:false;seller:boolean;blockers:string[];allocation?:{platformMinor:number;sellerMinor:number;basisPoints:number}|null;sandboxRecipientVerified?:boolean}
export function checkoutMethodLabel(method:string){return method==='MOBILE_MONEY'?'Mobile money':method==='CARD'?'Card':method==='CASH'?'Cash':'Unavailable'}
