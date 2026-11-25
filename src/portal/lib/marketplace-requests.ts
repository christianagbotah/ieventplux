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
