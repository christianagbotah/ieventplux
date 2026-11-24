import {expect,test} from 'bun:test'
import {MarketplaceQuoteError,buildMarketplaceQuote,parseQuoteSelections,type QuoteVariant} from './marketplace-quote-policy'
const a='clmarketvariant000001'
const b='clmarketvariant000002'
const row=(changes:Partial<QuoteVariant>={}):QuoteVariant=>({
  id:a,sku:'NAT-001',title:'Natural',priceMinor:2250,currency:'GHS',stockOnHand:12,stockReserved:3,
  product:{id:'prod000001',name:'African basket',status:'ACTIVE',productKind:'GOODS',deletedAt:null},...changes,
})
test('quote parser rejects client-side price/stock tampering and duplicate SKUs',()=>{
  expect(parseQuoteSelections({items:[{variantId:a,quantity:2}]})).toEqual([{variantId:a,quantity:2}])
  for(const body of [null,{},[],{items:[]},{items:[{variantId:a,quantity:0}]},
    {items:[{variantId:a,quantity:1.5}]},{items:[{variantId:a,quantity:'2'}]},
    {items:[{variantId:a,quantity:21}]},{items:[{variantId:a,quantity:1,priceMinor:1}]},
    {items:[{variantId:a,quantity:1},{variantId:a,quantity:1}]},
    {items:[{variantId:a,quantity:1}],priceMinor:1},
    {items:[{variantId:a,quantity:20},{variantId:b,quantity:20},{variantId:'clmarketvariant000003',quantity:20}]}])
    expect(()=>parseQuoteSelections(body)).toThrow(MarketplaceQuoteError)
})
test('server-calculated quote is a non-binding, stock-aware single-currency estimate',()=>{
  const q=buildMarketplaceQuote([{variantId:a,quantity:2}],[row()],'GHS')
  expect(q.totalMinor).toBe(4500)
  expect(q.items[0].available).toBe(9)
  expect(q.unitCount).toBe(2)
  expect(q.checkoutEnabled).toBe(false)
  expect(q.inventoryReserved).toBe(false)
  expect(q.currency).toBe('GHS')
  expect(q.items[0].unitPriceMinor).toBe(2250)
})
test('no stale, hidden, mixed-currency, oversold or invalid-price checkout quotations',()=>{
  const items=[{variantId:a,quantity:1}]
  for(const v of [row({stockOnHand:3,stockReserved:3}),row({currency:'USD'}),
    row({priceMinor:0}),row({priceMinor:Infinity}),row({product:{id:'p',name:'Hidden',status:'DRAFT',productKind:'GOODS',deletedAt:null}}),
    row({product:{id:'p',name:'Service',status:'ACTIVE',productKind:'SERVICE',deletedAt:null}})])
    expect(()=>buildMarketplaceQuote(items,[v],'GHS')).toThrow(MarketplaceQuoteError)
  expect(()=>buildMarketplaceQuote(items,[],'GHS')).toThrow(MarketplaceQuoteError)
  expect(()=>buildMarketplaceQuote(items,[row()],'USD')).toThrow(MarketplaceQuoteError)
  expect(()=>buildMarketplaceQuote([{variantId:a,quantity:10}],[row()],'GHS')).toThrow('only 9 available')
})
