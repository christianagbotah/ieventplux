export function parseSouvenirRequest(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Review the product and quantity.')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==4||typeof x.productId!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(x.productId)||typeof x.requestKey!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(x.requestKey)||typeof x.quantity!=='number'||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>20||typeof x.expectedUnitPriceMinor!=='number'||!Number.isSafeInteger(x.expectedUnitPriceMinor)||x.expectedUnitPriceMinor<1||x.quantity*x.expectedUnitPriceMinor>100_000_000)throw new Error('Invalid reviewed merchandise request.')
 return {productId:x.productId,requestKey:x.requestKey,quantity:x.quantity,expectedUnitPriceMinor:x.expectedUnitPriceMinor}
}
export function quoteSouvenir(input:ReturnType<typeof parseSouvenirRequest>,product:{active:boolean;currency:string;priceMinor:number;stockTotal:number;stockReserved:number;stockSold:number}){
 if(!product.active||product.currency!=='GHS'||product.priceMinor!==input.expectedUnitPriceMinor||product.stockTotal-product.stockReserved-product.stockSold<input.quantity)throw new Error('Product price or availability changed. Review again.')
 return {quantity:input.quantity,unitPriceMinor:product.priceMinor,totalMinor:input.quantity*product.priceMinor,currency:'GHS'}
}
