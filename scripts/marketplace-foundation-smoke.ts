/**
 * Seller ownership, public catalogue visibility and atomic inventory tests.
 * ONLY against disposable seeded GitHub CI PostgreSQL, never live commerce.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'

if(process.env.CI!=='true' || process.env.NODE_ENV==='production' ||
   process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes' ||
   !(process.env.DATABASE_URL?.includes('@localhost:5432/ieventplux') ||
     process.env.DATABASE_URL?.includes('@127.0.0.1:5432/ieventplux'))){
  throw new Error('Refusing to run marketplace tests outside isolated seeded CI DB.')
}
const BASE='http://127.0.0.1:3000/api/v1'
type Row=Record<string,any>
function assert(condition:unknown,label:string){
  if(!condition)throw new Error('MARKETPLACE TEST FAILED: '+label)
  console.log('PASS '+label)
}
async function signIn(email:string){
  const response=await fetch(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'Dev@12345'})})
  assert(response.status===200,'seeded account login '+email)
  return (response.headers.getSetCookie?.()[0]??response.headers.get('set-cookie')??'').split(';')[0]
}
async function send(method:string,path:string,cookie?:string,body?:unknown){
  const response=await fetch(BASE+path,{method,headers:{
    ...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await response.json().catch(()=>({})) as Row
  return {status:response.status,data}
}

let storeId:string|undefined
try{
 const owner=await signIn('pastor@lightworld.dev')
 const stranger=await signIn('ama@example.dev')
 const unique=randomUUID().slice(0,10).toLowerCase()
 const slug='ci-marketplace-'+unique
 const draft={name:'CI Ghanaian Arts and Crafts',slug,category:'Handmade apparel',tagline:'Synthetic CI seller'}
 assert((await send('POST','/marketplace/stores',undefined,draft)).status===401,'anonymous cannot create seller storefront')
 const made=await send('POST','/marketplace/stores',owner,draft)
 assert(made.status===201&&typeof made.data.store?.id==='string','seller creates independent draft store')
 storeId=made.data.store.id
 assert((await send('GET','/marketplace/stores/'+slug)).status===404,'public cannot enumerate unpublished stores')
 assert((await send('GET','/marketplace/stores/'+slug,owner)).data.canManage===true,'owner accesses private draft')
 assert((await send('PATCH','/marketplace/stores/'+slug,stranger,{status:'ACTIVE'})).status===403,'another user cannot publish store')
 const activate=await send('PATCH','/marketplace/stores/'+slug,owner,{status:'ACTIVE'})
 assert(activate.status===200,'verified seeded seller publishes store')
 const product={
   name:'Handwoven Ghanaian Kente Cloth',slug:'handwoven-kente-ci',
   category:'Textiles',description:'Synthetic locally-made ceremonial fabric with documented material, size and origin.',
   productKind:'GOODS',brand:'CI Artisan Workshop',images:[],
   specifications:{Material:'Cotton',Origin:'Ghana'},
   variants:[{title:'Large, gold',sku:'CI-KENTE-'+unique.toUpperCase(),priceMinor:35000,optionValues:{Size:'Large'}}],
 }
 assert((await send('POST','/marketplace/stores/'+slug+'/products',stranger,product)).status===403,
   'unrelated account cannot add product')
 const created=await send('POST','/marketplace/stores/'+slug+'/products',owner,product)
 assert(created.status===201,'seller creates product draft with SKU')
 const productId=created.data.product.id as string
 let publicData=await send('GET','/marketplace/stores/'+slug)
 assert(publicData.status===200&&publicData.data.products.length===0,'public cannot see product drafts')
 assert((await send('PATCH','/marketplace/products/'+productId,stranger,{status:'ACTIVE'})).status===403,
   'unrelated account cannot publish product')
 assert((await send('PATCH','/marketplace/products/'+productId,owner,{status:'ACTIVE'})).status===200,
   'seller publishes item independently of any event')
 const owned=await send('GET','/marketplace/stores/'+slug,owner)
 const variantId=owned.data.products[0].variants[0].id as string
 const key='stock-received-'+unique
 assert((await send('POST','/marketplace/variants/'+variantId+'/stock',stranger,
   {delta:12,reason:'Supplier restock',requestKey:key})).status===403,
   'non-owner cannot adjust inventory')
 const receive=await send('POST','/marketplace/variants/'+variantId+'/stock',owner,
   {delta:12,reason:'Supplier restock',requestKey:key})
 assert(receive.status===201&&receive.data.stock.stockOnHand===12,'seller receives 12 physical units')
 const replay=await send('POST','/marketplace/variants/'+variantId+'/stock',owner,
   {delta:12,reason:'Supplier restock',requestKey:key})
 assert(replay.status===200&&replay.data.stock.applied===false,'duplicate stock request is idempotent')
 assert((await send('POST','/marketplace/variants/'+variantId+'/stock',owner,
   {delta:-13,reason:'Large mistaken write-off',requestKey:'stock-negative-'+unique})).status===409,
   'inventory cannot be reduced below available units')
 const history=await send('GET','/marketplace/variants/'+variantId+'/stock',owner)
 assert(history.status===200&&history.data.movements.length===1,
   'movement ledger has one append-only adjustment')
 assert((await send('GET','/marketplace/variants/'+variantId+'/stock',stranger)).status===403,
   'stock movement ledger is private to seller')
 publicData=await send('GET','/marketplace/stores/'+slug)
 const listed=publicData.data.products[0]
 assert(publicData.status===200&&listed.variants[0].available===12&&
   listed.variants[0].priceMinor===35000&&publicData.data.checkoutEnabled===false,
   'public customer sees accurate price and availability without unverified checkout')
 const search=await send('GET','/marketplace/stores?q='+encodeURIComponent('CI Ghanaian'))
 assert(search.status===200&&search.data.stores.some((x:Row)=>x.slug===slug),
   'published store appears in public marketplace discovery')
 assert(!JSON.stringify(publicData.data).includes('ownerId')&&
   !JSON.stringify(publicData.data).includes('stockReserved'),
   'public storefront never exposes private owner and inventory reservation fields')
 const third=await signIn('kojo@example.dev')
 const requestPath='/marketplace/stores/'+slug+'/requests'
 const orderBody={requestKey:'purchase-request-'+unique,expectedTotalMinor:70000,
   items:[{variantId,quantity:2,expectedUnitPriceMinor:35000}]}
 assert((await send('POST',requestPath,undefined,orderBody)).status===401,'anonymous purchase request denied')
 assert((await send('POST',requestPath,owner,orderBody)).status===403,'seller cannot request own products')
 const submitted=await send('POST',requestPath,stranger,orderBody)
 assert(submitted.status===201&&submitted.data.request.status==='REQUESTED'&&submitted.data.checkoutEnabled===false&&submitted.data.inventoryReserved===false,
   'buyer persists an explicitly non-binding purchase request')
 const duplicate=await send('POST',requestPath,stranger,orderBody)
 assert(duplicate.status===200&&duplicate.data.replayed===true&&duplicate.data.request.id===submitted.data.request.id,'duplicate purchase request is idempotent')
 const changed={...orderBody,expectedTotalMinor:35000,items:[{variantId,quantity:1,expectedUnitPriceMinor:35000}]}
 assert((await send('POST',requestPath,stranger,changed)).status===409,'request key cannot be reused with different selection')
 const stale={...orderBody,requestKey:'stale-purchase-'+unique,expectedTotalMinor:60000,items:[{variantId,quantity:2,expectedUnitPriceMinor:30000}]}
 assert((await send('POST',requestPath,stranger,stale)).status===409,'stale reviewed price cannot create a request')
 assert((await send('GET',requestPath,owner)).data.requests.length===1,'seller views incoming purchase request')
 assert((await send('GET',requestPath,stranger)).data.requests.length===1,'buyer views their purchase request')
 assert((await send('GET',requestPath,third)).data.requests.length===0,'other buyer cannot see private requests')
 assert((await send('GET',requestPath)).status===401,'anonymous purchase history denied')
 const decisionPath='/marketplace/requests/'+submitted.data.request.id
 assert((await send('PATCH',decisionPath,third,{status:'ACKNOWLEDGED'})).status===404,'third party cannot change purchase request')
 assert((await send('PATCH',decisionPath,stranger,{status:'ACKNOWLEDGED'})).status===403,'buyer cannot acknowledge as seller')
 assert((await send('PATCH',decisionPath,owner,{status:'WITHDRAWN'})).status===403,'seller cannot withdraw for buyer')
 const acknowledged=await send('PATCH',decisionPath,owner,{status:'ACKNOWLEDGED'})
 assert(acknowledged.status===200&&acknowledged.data.request.status==='ACKNOWLEDGED'&&acknowledged.data.inventoryReserved===false&&acknowledged.data.checkoutEnabled===false,'seller acknowledges without confirming order')
 assert((await send('PATCH',decisionPath,owner,{status:'ACKNOWLEDGED'})).status===200,'same decision replay is safe')
 assert((await send('GET',requestPath,stranger)).data.requests[0].status==='ACKNOWLEDGED','buyer sees seller response')
 assert((await send('PATCH',decisionPath,stranger,{status:'WITHDRAWN'})).data.request.status==='WITHDRAWN','buyer can withdraw acknowledged request')
 assert((await send('PATCH',decisionPath,owner,{status:'DECLINED'})).status===409,'withdrawn request cannot be changed')
 const unchanged=await send('GET','/marketplace/stores/'+slug)
 assert(unchanged.data.products[0].variants[0].available===12,'non-binding request does not reserve inventory')
 console.log('MARKETPLACE_FOUNDATION_SMOKE_PASS')
}finally{
 if(storeId){
   await db.marketplacePurchaseRequest.deleteMany({where:{storeId}})
   await db.marketplaceStore.delete({where:{id:storeId}})
   console.log('Synthetic seller and stock ledger deleted from disposable CI DB.')
 }
 await db.$disconnect()
}
