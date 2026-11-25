import {parseQuoteSelections,MarketplaceQuoteError} from './marketplace-quote-policy'
import {createHash} from 'node:crypto'

export function parsePurchaseRequest(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new MarketplaceQuoteError('A reviewed basket is required.')
  const x=raw as Record<string,unknown>
  if(Object.keys(x).some(k=>!['items','requestKey','expectedTotalMinor'].includes(k)))
    throw new MarketplaceQuoteError('Unexpected purchase request fields.')
  if(typeof x.requestKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(x.requestKey))
    throw new MarketplaceQuoteError('A unique request key is required.')
  if(typeof x.expectedTotalMinor!=='number'||!Number.isSafeInteger(x.expectedTotalMinor)||x.expectedTotalMinor<1||x.expectedTotalMinor>100_000_000)
    throw new MarketplaceQuoteError('Review the current basket total first.')
  if(!Array.isArray(x.items))throw new MarketplaceQuoteError('A reviewed basket is required.')
  const reviewed=x.items.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new MarketplaceQuoteError('Invalid item.')
    const item=entry as Record<string,unknown>
    if(Object.keys(item).some(k=>!['variantId','quantity','expectedUnitPriceMinor'].includes(k))||
      typeof item.expectedUnitPriceMinor!=='number'||!Number.isSafeInteger(item.expectedUnitPriceMinor)||item.expectedUnitPriceMinor<1||item.expectedUnitPriceMinor>100_000_000)
      throw new MarketplaceQuoteError('Review each current item price.')
    return {variantId:item.variantId,quantity:item.quantity,expectedUnitPriceMinor:item.expectedUnitPriceMinor}
  })
  const items=parseQuoteSelections({items:reviewed.map(({variantId,quantity})=>({variantId,quantity}))})
    .map((item,i)=>({...item,expectedUnitPriceMinor:reviewed[i]!.expectedUnitPriceMinor}))
    .sort((a,b)=>a.variantId.localeCompare(b.variantId))
  if(items.reduce((sum,item)=>sum+item.quantity*item.expectedUnitPriceMinor,0)!==x.expectedTotalMinor)
    throw new MarketplaceQuoteError('Reviewed prices do not match the basket total.')
  const fingerprint=createHash('sha256').update(JSON.stringify({items,total:x.expectedTotalMinor})).digest('hex')
  return {items,requestKey:x.requestKey,expectedTotalMinor:x.expectedTotalMinor,fingerprint}
}

export function assertReviewedPrices(input:ReturnType<typeof parsePurchaseRequest>,quote:{totalMinor:number;items:{variantId:string;unitPriceMinor:number}[]}){
  if(quote.totalMinor!==input.expectedTotalMinor||input.items.some(i=>quote.items.find(q=>q.variantId===i.variantId)?.unitPriceMinor!==i.expectedUnitPriceMinor))
    throw new MarketplaceQuoteError('Prices changed. Review the basket again before submitting.')
}
