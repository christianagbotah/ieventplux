import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {publishNotification} from './notify'
import {holdPilotEnabled} from '../marketplace-hold-policy'
import type {Notification} from '@prisma/client'
import {buildMarketplaceQuote,MarketplaceQuoteError} from '@/server/marketplace-quote-policy'
import {assertReviewedPrices,parsePurchaseRequest,parseRequestDecision,decisionAllowed,requestNotification} from '@/server/marketplace-request-policy'

const requestSelect={id:true,status:true,totalMinor:true,currency:true,unitCount:true,items:true,createdAt:true} as const

export async function listPurchaseRequests(slug:string,userId:string){
  const store=await db.marketplaceStore.findUnique({where:{slug},select:{id:true,ownerId:true}})
  if(!store)throw errors.notFound('Store not found.')
  const seller=store.ownerId===userId
  const requests=await db.marketplacePurchaseRequest.findMany({
    where:{storeId:store.id,...(seller?{}:{buyerId:userId})},
    select:{...requestSelect,stockHold:{select:{id:true,status:true,expiresAt:true,releasedAt:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,
  })
  return {requests,seller,checkoutEnabled:false,inventoryReserved:false,stockHoldEnabled:holdPilotEnabled(process.env)}
}

export async function createPurchaseRequest(slug:string,userId:string,raw:unknown){
  const input=parsePurchaseRequest(raw)
  try{
    const {result,notice}=await db.$transaction(async tx=>{
      const store=await tx.marketplaceStore.findUnique({where:{slug},select:{id:true,status:true,deletedAt:true,ownerId:true,currency:true}})
      if(!store)throw errors.notFound('Store not found.')
      if(store.ownerId===userId)throw errors.forbidden('Sellers cannot submit requests to their own store.')
      const key={buyerId:userId,storeId:store.id,requestKey:input.requestKey}
      const prior=await tx.marketplacePurchaseRequest.findUnique({where:{buyerId_storeId_requestKey:key},select:{...requestSelect,fingerprint:true}})
      if(prior){
        if(prior.fingerprint!==input.fingerprint)throw errors.conflict('This request key was used with different items.')
        const {fingerprint:_fingerprint,...request}=prior
        void _fingerprint
        return {result:{request,replayed:true},notice:null}
      }
      if(store.deletedAt||store.status!=='ACTIVE')throw errors.notFound('Store is unavailable.')
      const variants=await tx.marketplaceVariant.findMany({
        where:{storeId:store.id,id:{in:input.items.map(i=>i.variantId)},active:true,
          product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},
        select:{id:true,sku:true,title:true,priceMinor:true,currency:true,stockOnHand:true,stockReserved:true,
          product:{select:{id:true,name:true,status:true,productKind:true,deletedAt:true}}},
      })
      let quote
      try{quote=buildMarketplaceQuote(input.items,variants,store.currency);assertReviewedPrices(input,quote)}
      catch(e){if(e instanceof MarketplaceQuoteError)throw errors.conflict(e.message);throw e}
      const request=await tx.marketplacePurchaseRequest.create({data:{
        ...key,fingerprint:input.fingerprint,currency:quote.currency,totalMinor:quote.totalMinor,unitCount:quote.unitCount,
        items:quote.items.map(({variantId,sku,variantTitle,productId,productName,quantity,unitPriceMinor,lineMinor,currency})=>
          ({variantId,sku,variantTitle,productId,productName,quantity,unitPriceMinor,lineMinor,currency})),
      },select:requestSelect})
      await tx.auditLog.create({data:{actorUserId:userId,actorLabel:'marketplace-buyer',action:'marketplace.request.create',
        entityType:'MarketplacePurchaseRequest',entityId:request.id,after:JSON.stringify({storeId:store.id,totalMinor:quote.totalMinor})}})
      const notice=await tx.notification.create({data:{userId:store.ownerId,...requestNotification('REQUESTED'),link:'#/shop/'+encodeURIComponent(slug)}})
      return {result:{request,replayed:false},notice}
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
    if(notice)await publishNotification(notice)
    return result
  }catch(e){
    if(e&&typeof e==='object'&&'code' in e&&(e.code==='P2002'||e.code==='P2034'))
      throw errors.conflict('Request conflicted. Retry using the same request key.')
    throw e
  }
}

/** Acknowledgement is not order confirmation; no inventory or financial mutation. */
export async function decidePurchaseRequest(id:string,userId:string,raw:unknown){
 const next=parseRequestDecision(raw)
 try{
  const {result,notice}=await db.$transaction(async tx=>{
   const row=await tx.marketplacePurchaseRequest.findUnique({where:{id},select:{...requestSelect,buyerId:true,
     stockHold:{select:{status:true}},store:{select:{ownerId:true,status:true,deletedAt:true,slug:true}}}})
   if(!row)throw errors.notFound('Purchase request not found.')
   const role=row.store.ownerId===userId?'seller':row.buyerId===userId?'buyer':null
   if(!role)throw errors.notFound('Purchase request not found.')
   if((role==='seller'&&next==='WITHDRAWN')||(role==='buyer'&&next!=='WITHDRAWN'))throw errors.forbidden('This decision is not available to your role.')
   if(role==='seller'&&(row.store.deletedAt||row.store.status==='SUSPENDED'))throw errors.conflict('This store cannot respond to requests.')
   if(!decisionAllowed(role,row.status,next))throw errors.conflict('This request has already been resolved. Refresh the request list.')
   if(row.stockHold?.status==='HELD'&&row.status!==next)throw errors.conflict('Release the temporary stock reservation before changing the request.')
   let notice:Notification|null=null
   if(row.status!==next){
    const changed=await tx.marketplacePurchaseRequest.updateMany({where:{id,status:row.status},data:{status:next}})
    if(changed.count!==1)throw errors.conflict('Request changed elsewhere. Refresh and try again.')
    await tx.auditLog.create({data:{actorUserId:userId,actorLabel:'marketplace-'+role,
      action:'marketplace.request.decision',entityType:'MarketplacePurchaseRequest',entityId:id,
      before:JSON.stringify({status:row.status}),after:JSON.stringify({status:next})}})
    notice=await tx.notification.create({data:{userId:role==='seller'?row.buyerId:row.store.ownerId,
      ...requestNotification(next),link:'#/shop/'+encodeURIComponent(row.store.slug)}})
   }
   const request=await tx.marketplacePurchaseRequest.findUniqueOrThrow({where:{id},select:requestSelect})
   return {result:{request,checkoutEnabled:false,inventoryReserved:false},notice}
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  if(notice)await publishNotification(notice)
  return result
 }catch(e){
  if(e&&typeof e==='object'&&'code' in e&&e.code==='P2034')throw errors.conflict('Request changed elsewhere. Refresh and try again.')
  throw e
 }
}
