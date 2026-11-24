import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
const root=new URL('../',import.meta.url)
const contents=(path:string)=>readFileSync(new URL(path,root),'utf8')
test('basket endpoint does not create orders or reserve stock; validates server-side visibility',()=>{
 const route=contents('app/api/v1/marketplace/stores/[slug]/quote/route.ts')
 expect(route).toContain("status:'ACTIVE'")
 expect(route).toContain("product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}")
 expect(route).toContain('MarketplaceQuoteError')
 expect(route).toContain("'Cache-Control','private, no-store'")
 expect(route).not.toMatch(/\.update\(|\.create\(|stockReserved.*increment/)
 expect(route).toContain('rateLimit')
})
test('web storefront uses server basket quote with explicit non-payment review',()=>{
 const page=contents('portal/views/MarketplaceStorefront.tsx')
 expect(page).toContain("+'/quote',{items:lines}")
 expect(page).toContain('Check prices & stock')
 expect(page).toContain('No inventory is held and no order or payment will be created')
 expect(page).toContain('result.checkoutEnabled!==false')
})
test('native storefront uses the same server quote and does not offer fake checkout',()=>{
 const page=contents('../mobile/src/screens/MarketplaceStoreScreen.tsx')
 const api=contents('../mobile/src/api/client.ts')
 expect(page).toContain('api.marketplace.quote(slug,selected)')
 expect(page).toContain('No stock is held')
 expect(page).toContain('Checkout & delivery not yet available')
 expect(api).toContain("'/marketplace/stores/' + encodeURIComponent(slug) + '/quote'")
})

test('both storefronts invalidate in-flight quotes when catalogue or store changes',()=>{
 for(const path of ['portal/views/MarketplaceStorefront.tsx','../mobile/src/screens/MarketplaceStoreScreen.tsx']){
   const page=contents(path)
   expect(page).toContain('const request=++quoteEpoch.current')
   expect(page).toContain('if(request===quoteEpoch.current)setQuote(result)')
   expect(page).toContain('if(request===quoteEpoch.current)setQuoteLoading(false)')
   expect(page).toContain("quoteEpoch.current++;setQuote(null);setQuoteError('');setQuoteLoading(false)")
   expect(page).toContain('return()=>{quoteEpoch.current++;catalogueEpoch.current++}')
   expect(page).toContain('if(request===catalogueEpoch.current)setLoading(false)')
   expect(page).toContain('next>20||quoteLoading||loading||((basket[variantId]??0)<next&&next>available)')
 }
})
