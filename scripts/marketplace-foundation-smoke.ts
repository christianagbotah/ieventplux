/**
 * Seller ownership, public catalogue visibility and atomic inventory tests.
 * ONLY against disposable seeded GitHub CI PostgreSQL, never live commerce.
 */
import { randomUUID } from 'node:crypto'
import {unlink} from 'node:fs/promises'
import sharp from 'sharp'
import {mediaFilePath,isPublicUploadName} from '../src/server/media-storage'
import { db } from '../src/lib/db'
import {reserveMarketplaceRequest,releaseMarketplaceRequest,expireMarketplaceHolds} from '../src/server/services/marketplace-holds'
import { recordPlannedPaymentIntent } from '../src/server/services/platform-payment-intents'

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
let notificationLink:string|undefined
let intentSource:string|undefined
const testMedia:string[]=[]
try{
 const owner=await signIn('pastor@lightworld.dev')
 const stranger=await signIn('ama@example.dev')
 const unique=randomUUID().slice(0,10).toLowerCase()
 const slug='ci-marketplace-'+unique
 notificationLink='#/shop/'+slug
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
 const location={gpsAddress:'GA-123-4567',latitude:5.603717,longitude:-0.186964}
 assert((await send('PATCH','/marketplace/stores/'+slug,stranger,location)).status===403,'non-owner cannot change store location')
 assert((await send('PATCH','/marketplace/stores/'+slug,owner,{latitude:100,longitude:0})).status===400,'invalid coordinates rejected')
 assert((await send('PATCH','/marketplace/stores/'+slug,owner,location)).status===200,'seller saves GPS and coordinates')
 const located=await send('GET','/marketplace/stores/'+slug,owner)
 assert(located.data.store.gpsAddress===location.gpsAddress&&located.data.store.latitude===location.latitude,'owner location persists')
 const nearbyPath='/marketplace/stores/nearby'
 const far=await db.marketplaceStore.create({data:{ownerId:(await db.marketplaceStore.findUniqueOrThrow({where:{id:storeId}})).ownerId,name:'CI farther '+unique,slug:slug+'-far',category:'Handmade apparel',latitude:5.703717,longitude:-0.186964,status:'ACTIVE'}})
 const hidden=await db.marketplaceStore.create({data:{ownerId:far.ownerId,name:'CI hidden '+unique,slug:slug+'-hidden',category:'Handmade apparel',latitude:5.603717,longitude:-0.186964,status:'DRAFT'}})
 try{
  const near=await send('POST',nearbyPath,undefined,{latitude:location.latitude,longitude:location.longitude,q:'Handmade apparel'})
  assert(near.status===200&&near.data.stores.some((x:Row)=>x.slug===slug)&&near.data.stores.some((x:Row)=>x.slug===far.slug)&&near.data.stores.findIndex((x:Row)=>x.slug===slug)<near.data.stores.findIndex((x:Row)=>x.slug===far.slug),'nearby search ranks real coordinates nearest first')
  assert(!near.data.stores.some((x:Row)=>x.slug===hidden.slug)&&near.data.stores.every((x:Row)=>x.latitude===undefined&&x.longitude===undefined),'nearby excludes drafts and exact coordinates')
  assert((await send('POST',nearbyPath,undefined,{latitude:5.6})).status===400,'incomplete search origin rejected')
 }finally{await db.marketplaceStore.deleteMany({where:{id:{in:[far.id,hidden.id]}}})}
 const uploadBrand=async(cookie:string,purpose:string)=>{
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#09776d'}}).png().toBuffer()
  const form=new FormData()
  form.append('file',new Blob([Uint8Array.from(bytes)],{type:'image/png'}),'synthetic.png')
  form.append('purpose',purpose)
  const response=await fetch(BASE+'/marketplace/stores/'+slug+'/images',{method:'POST',headers:{Cookie:cookie},body:form})
  const data=await response.json()
  if(response.ok&&typeof data.url==='string'&&data.url.startsWith('/uploads/')){
    const filename=data.url.slice('/uploads/'.length)
    if(isPublicUploadName(filename))testMedia.push(filename)
  }
  return {status:response.status,data}
 }
 assert((await uploadBrand(stranger,'logo')).status===403,'non-owner cannot upload store branding')
 const logo=await uploadBrand(owner,'logo'),cover=await uploadBrand(owner,'cover')
 assert(logo.status===201&&cover.status===201&&logo.data.url!==cover.data.url,'owner uploads distinct logo and banner')
 const branded=await send('GET','/marketplace/stores/'+slug,owner)
 assert(branded.data.store.logoUrl===logo.data.url&&branded.data.store.coverUrl===cover.data.url,'branding persists on catalogue')
 assert((await send('PATCH','/marketplace/stores/'+slug,owner,{gpsAddress:'GA-123-4568'})).status===200,'location-only edit preserves branded store')
 const brandedAgain=await send('GET','/marketplace/stores/'+slug)
 assert(brandedAgain.data.store.logoUrl===logo.data.url&&brandedAgain.data.store.coverUrl===cover.data.url,'public storefront preserves branding after update')
 const settingsPath='/marketplace/stores/'+slug+'/payment-settings'
 const onboardingPath='/marketplace/stores/'+slug+'/settlement-onboarding'
 const pref={mobileMoney:true,card:true,cash:true,destination:'BANK'}
 assert((await send('GET',settingsPath)).status===401,'anonymous cannot read seller payment settings')
 assert((await send('GET',settingsPath,stranger)).status===403,'unrelated buyer cannot read seller payment preferences')
 const initialSettings=await send('GET',settingsPath,owner)
 assert(initialSettings.status===200&&initialSettings.data.checkoutEnabled===false&&initialSettings.data.settlementStatus==='NOT_CONFIGURED'&&initialSettings.data.preferences.mobileMoney===false,'new store has no activated payment or settlement credentials')
 assert((await send('POST',onboardingPath,owner,{})).status===400,'settlement request requires saved online methods and bank preference')
 assert((await send('PATCH',settingsPath,stranger,pref)).status===403,'buyer cannot change merchant payment preferences')
 assert((await send('PATCH',settingsPath,owner,{...pref,verified:true})).status===400,'merchant cannot forge settlement verification')
 assert((await send('PATCH',settingsPath,owner,{...pref,subaccountCode:'ACCT_invalid'})).status===400,'merchant cannot inject recipient account')
 const saved=await send('PATCH',settingsPath,owner,pref)
 assert(saved.status===200&&saved.data.preferences.mobileMoney===true&&saved.data.checkoutEnabled===false,'seller preferences persist without enabling checkout')
 assert((await send('POST',onboardingPath,stranger,{})).status===403,'unrelated user cannot request onboarding')
 const requested=await send('POST',onboardingPath,owner,{})
 assert(requested.status===201&&requested.data.settlementStatus==='REQUESTED'&&requested.data.checkoutEnabled===false,'seller requests sandbox onboarding only')
 assert((await send('POST',onboardingPath,owner,{})).status===409,'duplicate onboarding is rejected')
 const afterRequest=await send('GET',settingsPath,owner)
 assert(afterRequest.data.settlementStatus==='REQUESTED'&&afterRequest.data.settlementAccount?.maskedAccount===null,'onboarding request contains no approved recipient')
 assert((await send('GET','/marketplace/commission-settings',owner)).status===403,'seller cannot access finance commission administration')
 assert((await send('POST','/marketplace/settlement-reviews',owner,{storeSlug:slug,subaccountCode:'ACCT_invalid',ownerReviewed:true})).status===403,'seller cannot call finance settlement verification')
 const safePublic=await send('GET','/marketplace/stores/'+slug)
 assert(safePublic.status===200&&!JSON.stringify(safePublic.data).includes('settlementAccount')&&!JSON.stringify(safePublic.data).includes('preferences'),'public catalogue never exposes private payment onboarding')
 intentSource='ci-intent-'+unique
 const intentInput={purpose:'MARKETPLACE_GOODS' as const,sourceId:intentSource,reference:'CI-PAY-'+unique,currency:'GHS' as const,totalMinor:10000,commissionMinor:1000,beneficiary:{kind:'STORE' as const,id:storeId!},pricingVersion:'ci-rate-v1'}
 const intents=await Promise.all([recordPlannedPaymentIntent(intentInput),recordPlannedPaymentIntent(intentInput)])
 assert(intents[0].id===intents[1].id&&intents[0].status==='PLANNED'&&intents[0].beneficiaryGrossMinor===9000,'concurrent identical purchase snapshots persist once without charging')
 let changedRejected=false
 try{await recordPlannedPaymentIntent({...intentInput,commissionMinor:500})}catch{changedRejected=true}
 assert(changedRejected,'persisted transaction commission cannot change on replay')
 assert(await db.platformPaymentIntent.count({where:{sourceId:intentSource}})===1,'only one durable payment intent exists')

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
 const initialNotices=await db.notification.findMany({where:{link:notificationLink,type:'MARKETPLACE_REQUEST'}})
 const sellerUser=await db.user.findUniqueOrThrow({where:{email:'pastor@lightworld.dev'},select:{id:true}})
 const buyerUser=await db.user.findUniqueOrThrow({where:{email:'ama@example.dev'},select:{id:true}})
 assert(initialNotices.length===1&&initialNotices[0].userId===sellerUser.id,'request replay creates exactly one private seller notification')
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
 const notices=await db.notification.findMany({where:{link:notificationLink,type:'MARKETPLACE_REQUEST'}})
 assert(notices.length===3&&notices.filter(n=>n.userId===sellerUser.id).length===2&&notices.filter(n=>n.userId===buyerUser.id).length===1,'request transitions notify only participants without replay duplicates')
 const buyerInbox=await send('GET','/notifications?pageSize=50',stranger)
 const sellerInbox=await send('GET','/notifications?pageSize=50',owner)
 const otherInbox=await send('GET','/notifications?pageSize=50',third)
 const ids=new Set(notices.map(n=>n.id))
 assert(buyerInbox.data.items.filter((n:Row)=>ids.has(n.id)).length===1&&sellerInbox.data.items.filter((n:Row)=>ids.has(n.id)).length===2&&!otherInbox.data.items.some((n:Row)=>ids.has(n.id)),'notification API exposes only the intended recipient alerts')
 const unchanged=await send('GET','/marketplace/stores/'+slug)
 assert(unchanged.data.products[0].variants[0].available===12,'non-binding request does not reserve inventory')
 const holdBody={...orderBody,requestKey:'hold-purchase-'+unique}
 const hReq=await send('POST',requestPath,stranger,holdBody)
 assert(hReq.status===201,'hold test request created')
 const hId=hReq.data.request.id
 assert((await send('PATCH','/marketplace/requests/'+hId,owner,{status:'ACKNOWLEDGED'})).status===200,'hold request acknowledged')
 assert((await send('POST','/marketplace/requests/'+hId+'/hold',owner,{})).status===503,'stock hold creation disabled by default')
 process.env.IEVENTPLUX_MARKETPLACE_STOCK_HOLD_ENABLED='true'
 const denied=await reserveMarketplaceRequest(hId,buyerUser.id).then(()=>false,e=>e.status===404)
 assert(denied,'buyer cannot reserve as seller')
 const held=await reserveMarketplaceRequest(hId,sellerUser.id)
 assert(held.hold.status==='HELD'&&held.checkoutEnabled===false,'seller reserves stock without payment')
 const repeat=await reserveMarketplaceRequest(hId,sellerUser.id)
 assert(repeat.hold.id===held.hold.id,'hold replay is idempotent')
 assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===2,'exact quantities held once')
 assert((await send('PATCH','/marketplace/requests/'+hId,stranger,{status:'WITHDRAWN'})).status===409,'request cannot be withdrawn while stock held')
 assert((await send('GET',requestPath,stranger)).data.requests.some((r:Row)=>r.id===hId&&r.stockHold?.status==='HELD'),'buyer sees own hold')
 const reviewPath='/marketplace/requests/'+hId+'/checkout-review'
 assert((await send('GET',reviewPath)).status===401,'anonymous checkout review denied')
 assert((await send('GET',reviewPath,third)).status===404,'unrelated user cannot read checkout review')
 const buyerReview=await send('GET',reviewPath,stranger)
 assert(buyerReview.status===200&&buyerReview.data.totalMinor===70000&&buyerReview.data.checkoutEnabled===false&&!('allocation' in buyerReview.data)&&!('sandboxRecipientVerified' in buyerReview.data),'buyer review uses immutable total and masks merchant details')
 const sellerReview=await send('GET',reviewPath,owner)
 assert(sellerReview.status===200&&sellerReview.data.holdValid===true&&sellerReview.data.checkoutEnabled===false&&('allocation' in sellerReview.data),'seller sees private allocation readiness without payment')
 assert(await db.platformPaymentIntent.count({where:{sourceId:hId}})===0,'checkout review creates no financial intent')

 const blocked=await send('POST','/marketplace/variants/'+variantId+'/stock',owner,{delta:-11,reason:'Would consume reserved stock',requestKey:'hold-stock-'+unique})
 assert(blocked.status===409,'stock adjustment cannot consume held units')
 const r=await releaseMarketplaceRequest(hId,buyerUser.id)
 assert(r.hold.status==='RELEASED','buyer can release their hold')
 await releaseMarketplaceRequest(hId,buyerUser.id)
 assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===0,'replay release restores stock exactly once')
 const h2=await send('POST',requestPath,stranger,{...orderBody,requestKey:'expiry-purchase-'+unique})
 await send('PATCH','/marketplace/requests/'+h2.data.request.id,owner,{status:'ACKNOWLEDGED'})
 const expiry=await reserveMarketplaceRequest(h2.data.request.id,sellerUser.id)
 // Advance only the injected sweep clock, avoiding competition with the real CI worker.
 const sweep=await expireMarketplaceHolds(new Date(expiry.hold.expiresAt.getTime()+1000))
 assert(sweep.released===1&&sweep.conflicts===0,'expired hold released by sweep')
 assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===0,'expiry restores stock')
 // Competing buyers may submit nonbinding requests for the same stock. Only
 // one can turn eight of twelve units into a hold, even under concurrency.
 const raceBody={expectedTotalMinor:280000,items:[{variantId,quantity:8,expectedUnitPriceMinor:35000}]}
 const first=await send('POST',requestPath,stranger,{...raceBody,requestKey:'hold-race-one-'+unique})
 const second=await send('POST',requestPath,third,{...raceBody,requestKey:'hold-race-two-'+unique})
 assert(first.status===201&&second.status===201,'competing nonbinding requests accepted')
 for(const row of [first,second])assert((await send('PATCH','/marketplace/requests/'+row.data.request.id,owner,{status:'ACKNOWLEDGED'})).status===200,'seller acknowledges competing request')
 const race=await Promise.allSettled([first,second].map(row=>reserveMarketplaceRequest(row.data.request.id,sellerUser.id)))
 const success=race.filter(x=>x.status==='fulfilled');const failure=race.filter(x=>x.status==='rejected')
 assert(success.length===1&&failure.length===1&&failure[0]?.status==='rejected'&&failure[0].reason?.status===409,'competing holds cannot oversell')
 assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===8,'only winning stock hold increments reservation')
 for(const row of [first,second]){const active=await db.marketplaceStockHold.findUnique({where:{requestId:row.data.request.id}});if(active)await releaseMarketplaceRequest(row.data.request.id,sellerUser.id)}
 assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===0,'winning hold release restores inventory exactly')
 const staleHold=await send('POST',requestPath,stranger,{...orderBody,requestKey:'hold-stale-price-'+unique})
 assert(staleHold.status===201,'new request saved with reviewed price')
 await send('PATCH','/marketplace/requests/'+staleHold.data.request.id,owner,{status:'ACKNOWLEDGED'})
 await db.marketplaceVariant.update({where:{id:variantId},data:{priceMinor:36000}})
 try{
  assert(await reserveMarketplaceRequest(staleHold.data.request.id,sellerUser.id).then(()=>false,e=>e.status===409),'price change invalidates stale hold')
  assert(await db.marketplaceStockHold.count({where:{requestId:staleHold.data.request.id}})===0,'stale hold has no durable reservation')
  assert((await db.marketplaceVariant.findUniqueOrThrow({where:{id:variantId}})).stockReserved===0,'stale hold leaves stock untouched')
 }finally{await db.marketplaceVariant.update({where:{id:variantId},data:{priceMinor:35000}})}
 delete process.env.IEVENTPLUX_MARKETPLACE_STOCK_HOLD_ENABLED
 console.log('MARKETPLACE_FOUNDATION_SMOKE_PASS')
}finally{
 if(notificationLink)await db.notification.deleteMany({where:{link:notificationLink,type:'MARKETPLACE_REQUEST'}})
 if(intentSource)await db.platformPaymentIntent.deleteMany({where:{sourceId:intentSource,purpose:'MARKETPLACE_GOODS'}})
 if(storeId){
   await db.marketplaceStockHoldLine.deleteMany({where:{hold:{request:{storeId}}}})
   await db.marketplaceStockHold.deleteMany({where:{request:{storeId}}})
   await db.marketplacePurchaseRequest.deleteMany({where:{storeId}})
   await db.marketplaceStore.delete({where:{id:storeId}})
   console.log('Synthetic seller and stock ledger deleted from disposable CI DB.')
 }
 for(const filename of testMedia)await unlink(mediaFilePath(filename)).catch(()=>{})
 await db.$disconnect()
}
