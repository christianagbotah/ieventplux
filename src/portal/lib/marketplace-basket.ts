/** Session-local shopper draft; the API recalculates all amounts and stock. */
export function basketSelection(quantities:Record<string,number>){
  return Object.entries(quantities).filter(([,quantity])=>Number.isSafeInteger(quantity)&&quantity>0)
    .sort(([a],[b])=>a.localeCompare(b)).map(([variantId,quantity])=>({variantId,quantity}))
}
export type StoreQuote={
  storeSlug:string;currency:string;unitCount:number;totalMinor:number;quotedAt:string;
  checkoutEnabled:false;inventoryReserved:false;notice:string;
  items:{variantId:string;sku:string;variantTitle:string;productName:string;quantity:number;
    unitPriceMinor:number;lineMinor:number;available:number;currency:string}[]
}

/** Match the server's quantity ceilings without trusting the client for pricing. */
export function canAddBasketUnit(basket:Record<string,number>,variantId:string,available:number){
  const current=basket[variantId]??0
  const counts=Object.values(basket).filter(n=>Number.isSafeInteger(n)&&n>0)
  return current<Math.min(available,20)&&counts.reduce((sum,n)=>sum+n,0)<50
    &&(current>0||counts.length<15)
}
