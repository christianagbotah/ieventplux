/** Pure basket policy shared by web, native and the HTTP API.
 * This is an informational quote: it never reserves stock or creates a payment.
 */
export class MarketplaceQuoteError extends Error {}

export type QuoteSelection = {variantId:string;quantity:number}
export type QuoteVariant = {
  id:string;sku:string;title:string;priceMinor:number;currency:string;
  stockOnHand:number;stockReserved:number;
  product:{id:string;name:string;status:string;productKind:string;deletedAt:Date|null}
}
const ID_PATTERN=/^[A-Za-z0-9_-]{8,128}$/
const MAX_LINES=15
const MAX_UNITS=50
const MAX_PER_LINE=20
const MAX_AMOUNT_MINOR=100_000_000

export function parseQuoteSelections(raw:unknown):QuoteSelection[]{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new MarketplaceQuoteError('Select the product options you want to review.')
  const x=raw as Record<string,unknown>
  if(Object.keys(x).some(key=>key!=='items'))throw new MarketplaceQuoteError('Only product options and quantities are accepted.')
  if(!Array.isArray(x.items)||x.items.length===0||x.items.length>MAX_LINES)
    throw new MarketplaceQuoteError(`Choose between 1 and ${MAX_LINES} different options.`)
  const seen=new Set<string>()
  let units=0
  const result:QuoteSelection[]=[]
  for(const entry of x.items){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new MarketplaceQuoteError('Each selection must include an option and a quantity.')
    const item=entry as Record<string,unknown>
    if(Object.keys(item).some(key=>key!=='variantId'&&key!=='quantity'))throw new MarketplaceQuoteError('Do not submit prices or stock levels from your device.')
    if(typeof item.variantId!=='string'||!ID_PATTERN.test(item.variantId)||seen.has(item.variantId))
      throw new MarketplaceQuoteError('Select distinct valid product options.')
    if(typeof item.quantity!=='number'||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>MAX_PER_LINE)
      throw new MarketplaceQuoteError(`Quantity must be a whole number between 1 and ${MAX_PER_LINE}.`)
    seen.add(item.variantId)
    units+=item.quantity
    if(units>MAX_UNITS)throw new MarketplaceQuoteError(`A basket can contain at most ${MAX_UNITS} items.`)
    result.push({variantId:item.variantId,quantity:item.quantity})
  }
  return result
}

export function buildMarketplaceQuote(selections:QuoteSelection[],catalogue:QuoteVariant[],storeCurrency:string){
  if(storeCurrency!=='GHS')throw new MarketplaceQuoteError('This store currency is not supported for basket review.')
  const byId=new Map(catalogue.map(item=>[item.id,item]))
  let totalMinor=0
  let count=0
  const items=selections.map(selection=>{
    const v=byId.get(selection.variantId)
    if(!v||v.product.deletedAt||v.product.status!=='ACTIVE'||v.product.productKind!=='GOODS')
      throw new MarketplaceQuoteError('A selected product is no longer published. Refresh the catalogue.')
    if(v.currency!==storeCurrency||!Number.isSafeInteger(v.priceMinor)||v.priceMinor<1||v.priceMinor>MAX_AMOUNT_MINOR)
      throw new MarketplaceQuoteError('A product has invalid pricing. Please contact its seller.')
    const available=Math.max(0,v.stockOnHand-v.stockReserved)
    if(!Number.isSafeInteger(available)||selection.quantity>available)
      throw new MarketplaceQuoteError(`${v.product.name} (${v.title}) has only ${available} available. Adjust your quantity.`)
    const lineMinor=v.priceMinor*selection.quantity
    totalMinor+=lineMinor
    count+=selection.quantity
    if(!Number.isSafeInteger(totalMinor)||totalMinor>MAX_AMOUNT_MINOR)
      throw new MarketplaceQuoteError('The basket exceeds the supported value. Reduce the quantities.')
    return {
      variantId:v.id,sku:v.sku,variantTitle:v.title,productId:v.product.id,
      productName:v.product.name,quantity:selection.quantity,unitPriceMinor:v.priceMinor,
      lineMinor,available,currency:storeCurrency,
    }
  })
  return {items,currency:storeCurrency,unitCount:count,totalMinor,
    checkoutEnabled:false as const,inventoryReserved:false as const,
    notice:'This is a non-binding price and stock check, not an order. Stock and prices may change. Payment and delivery are not enabled.'}
}
