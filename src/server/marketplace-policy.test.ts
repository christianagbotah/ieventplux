import { expect, test } from 'bun:test'
import { availableStock, parseProductDraft, parseVariantPriceChange, parseStockAdjustment, parseStoreDraft, stockChangeAllowed } from './marketplace-policy'

const goodStore = { name:'Kente & Culture Ghana', slug:'kente-culture-gh', category:'Fashion and crafts' }
const goodProduct = {
 name:'Handwoven Kente ceremonial cloth', slug:'woven-kente-ceremonial',
 description:'Authentic Ghanaian handwoven cloth with full measurements, care notes, and provenance.',
 category:'Traditional apparel', productKind:'GOODS',
 specifications:{ Material:'Cotton weave', 'Length cm':'250' },
 images:['https://images.example.com/kente.png'],
 variants:[{ title:'Gold and blue | Large', sku:'KENTE-G-B-L', priceMinor:35000, optionValues:{Size:'Large'} }],
}
test('seller validates independent store, no event reference required',()=>{
 const x=parseStoreDraft(goodStore)
 expect(x.slug).toBe('kente-culture-gh')
 expect(x.description).toBeNull()
})
test('rejects unsafe storefront slugs and non-HTTPS assets',()=>{
 expect(()=>parseStoreDraft({...goodStore,slug:'../../admin'})).toThrow()
 expect(()=>parseStoreDraft({...goodStore,logoUrl:'javascript:alert(1)'})).toThrow()
})
test('product accepts rich specifications, variant prices and image gallery',()=>{
 const x=parseProductDraft(goodProduct)
 expect(x.variants[0].sku).toBe('KENTE-G-B-L')
 expect(JSON.parse(x.specifications).Material).toBe('Cotton weave')
})
test('product rejects duplicate SKU and fake monetary units',()=>{
 expect(()=>parseProductDraft({...goodProduct,variants:[goodProduct.variants[0],{...goodProduct.variants[0],sku:'kente-g-b-l'}]})).toThrow()
 expect(()=>parseProductDraft({...goodProduct,variants:[{...goodProduct.variants[0],priceMinor:7.25}]})).toThrow()
 expect(()=>parseProductDraft({...goodProduct,variants:[{...goodProduct.variants[0],priceMinor:-20}]})).toThrow()
})
test('product rejects hazardous specification values and untrusted image URLs',()=>{
 expect(()=>parseProductDraft({...goodProduct,images:['file:///etc/passwd']})).toThrow()
 expect(()=>parseProductDraft({...goodProduct,specifications:{'X': 'Not enough key letters'}})).toThrow()
})
test('stock adjustment requires idempotency key, reason and whole units',()=>{
 const x=parseStockAdjustment({delta:10,reason:'Received goods from supplier',requestKey:'stock-receipt-20261123'})
 expect(x.delta).toBe(10)
 expect(()=>parseStockAdjustment({...x,delta:2.5})).toThrow()
 expect(()=>parseStockAdjustment({...x,requestKey:'short'})).toThrow()
})
test('stock cannot fall below quantity reserved for buyers',()=>{
 expect(availableStock(20,5)).toBe(15)
 expect(stockChangeAllowed(20,5,-15)).toBe(true)
 expect(stockChangeAllowed(20,5,-16)).toBe(false)
 expect(stockChangeAllowed(0,0,-1)).toBe(false)
})

test('variant price updates reject stock, identity and noninteger price changes',()=>{
  expect(parseVariantPriceChange({priceMinor:1250,expectedPriceMinor:1000})).toEqual({priceMinor:1250,expectedPriceMinor:1000})
  for(const raw of [{priceMinor:0,expectedPriceMinor:1000},{priceMinor:12.5,expectedPriceMinor:1000},
    {priceMinor:1250},{priceMinor:1250,expectedPriceMinor:1000,stockOnHand:999},
    {priceMinor:1250,expectedPriceMinor:1000,ownerId:'other'}])expect(()=>parseVariantPriceChange(raw)).toThrow()
})
