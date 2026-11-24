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
