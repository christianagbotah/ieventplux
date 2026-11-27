import {Prisma,type Notification} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {MARKETPLACE_HOLD_MS,MARKETPLACE_HOLD_SWEEP_LIMIT,heldSelections,holdPilotEnabled} from '../marketplace-hold-policy'
import {buildMarketplaceQuote,MarketplaceQuoteError} from '../marketplace-quote-policy'
import {assertReviewedPrices} from '../marketplace-request-policy'
import {publishNotification} from './notify'
const holdView={id:true,requestId:true,status:true,expiresAt:true,releasedAt:true,createdAt:true} as const
async function transaction<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>){
 try{return await db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
 catch(e){if(e&&typeof e==='object'&&'code' in e&&['P2034','P2002'].includes(String(e.code)))throw errors.conflict('Stock or request changed. Refresh and retry.');throw e}
}
async function notifyAll(rows:Notification[]){await Promise.all(rows.map(publishNotification))}
/** Seller action only. Never create order, payment, settlement or sold quantity. */
export async function reserveMarketplaceRequest(requestId:string,sellerId:string){
 if(!holdPilotEnabled(process.env))throw errors.unavailable('STOCK_HOLD_DISABLED','Stock reservations are not available yet.')
 const result=await transaction(async tx=>{
  const request=await tx.marketplacePurchaseRequest.findUnique({where:{id:requestId},include:{store:{select:{id:true,ownerId:true,status:true,deletedAt:true,currency:true,slug:true}},stockHold:{select:holdView}}})
  if(!request||request.store.ownerId!==sellerId)throw errors.notFound('Purchase request not found.')
  if(!await tx.user.findFirst({where:{id:sellerId,status:'ACTIVE',deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}}))throw errors.forbidden('An active verified seller is required.')
  if(request.stockHold)return {hold:request.stockHold,notices:[] as Notification[]}
  if(request.status!=='ACKNOWLEDGED'||request.store.status!=='ACTIVE'||request.store.deletedAt)throw errors.conflict('Only acknowledged requests at active stores can be reserved.')
  if(!await tx.user.findFirst({where:{id:request.buyerId,status:'ACTIVE',deletedAt:null},select:{id:true}}))throw errors.conflict('The buyer account is unavailable.')
  let input;try{input=heldSelections(request)}catch{throw errors.conflict('The saved request is invalid. Ask the buyer to submit a new request.')}
  const catalogue=await tx.marketplaceVariant.findMany({where:{storeId:request.storeId,id:{in:input.items.map(x=>x.variantId)},active:true,product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},select:{id:true,sku:true,title:true,priceMinor:true,currency:true,stockOnHand:true,stockReserved:true,product:{select:{id:true,name:true,status:true,productKind:true,deletedAt:true}}}})
  try{assertReviewedPrices(input,buildMarketplaceQuote(input.items,catalogue,request.store.currency))}catch(e){if(e instanceof MarketplaceQuoteError)throw errors.conflict(e.message);throw e}
  // Serializable isolation protects the stock read/write and simultaneous holds.
  for(const line of input.items)await tx.marketplaceVariant.update({where:{id:line.variantId},data:{stockReserved:{increment:line.quantity}}})
  const hold=await tx.marketplaceStockHold.create({data:{requestId,expiresAt:new Date(Date.now()+MARKETPLACE_HOLD_MS),lines:{create:input.items.map(x=>({variantId:x.variantId,quantity:x.quantity}))}},select:holdView})
  await tx.auditLog.create({data:{actorUserId:sellerId,actorLabel:'marketplace-seller',action:'marketplace.hold.create',entityType:'MarketplaceStockHold',entityId:hold.id}})
  const notice=await tx.notification.create({data:{userId:request.buyerId,type:'MARKETPLACE_REQUEST',title:'Temporary stock reservation',body:'The seller has held your requested items for 30 minutes. No order or payment has been created.',link:'#/shop/'+encodeURIComponent(request.store.slug)}})
  return {hold,notices:[notice]}
 })
 await notifyAll(result.notices);return {hold:result.hold,checkoutEnabled:false}
}
async function releaseInTransaction(tx:Prisma.TransactionClient,requestId:string,actorId:string|null,now:Date){
 const row=await tx.marketplaceStockHold.findUnique({where:{requestId},include:{lines:{orderBy:{variantId:'asc'}},request:{select:{buyerId:true,store:{select:{ownerId:true,slug:true}}}}}})
 if(!row||(actorId!==null&&actorId!==row.request.buyerId&&actorId!==row.request.store.ownerId))throw errors.notFound('Stock reservation not found.')
 if(row.status!=='HELD')return {hold:await tx.marketplaceStockHold.findUniqueOrThrow({where:{id:row.id},select:holdView}),notices:[] as Notification[],changed:false}
 if(actorId===null&&row.expiresAt>now)return {hold:await tx.marketplaceStockHold.findUniqueOrThrow({where:{id:row.id},select:holdView}),notices:[] as Notification[],changed:false}
 const status=row.expiresAt<=now?'EXPIRED':'RELEASED'
 for(const line of row.lines){const updated=await tx.marketplaceVariant.updateMany({where:{id:line.variantId,stockReserved:{gte:line.quantity}},data:{stockReserved:{decrement:line.quantity}}});if(updated.count!==1)throw errors.conflict('Stock reservation reconciliation is required.')}
 const hold=await tx.marketplaceStockHold.update({where:{id:row.id},data:{status,releasedAt:now},select:holdView})
 await tx.auditLog.create({data:{...(actorId?{actorUserId:actorId}:{}),actorLabel:actorId?'marketplace-participant':'marketplace-expiry',action:'marketplace.hold.'+status.toLowerCase(),entityType:'MarketplaceStockHold',entityId:row.id}})
 const recipients=[...new Set([row.request.buyerId,row.request.store.ownerId])].filter(x=>x!==actorId)
 const notices=await Promise.all(recipients.map(userId=>tx.notification.create({data:{userId,type:'MARKETPLACE_REQUEST',title:status==='EXPIRED'?'Stock reservation expired':'Stock reservation released',body:'The temporary stock hold has ended. No payment was collected.',link:'#/shop/'+encodeURIComponent(row.request.store.slug)}})))
 return {hold,notices,changed:true}
}
export async function releaseMarketplaceRequest(requestId:string,actorId:string){const result=await transaction(tx=>releaseInTransaction(tx,requestId,actorId,new Date()));await notifyAll(result.notices);return {hold:result.hold,checkoutEnabled:false}}
/** Bounded sweep; never release someone else's hold or subtract sold stock. */
export async function expireMarketplaceHolds(now=new Date()){
 const rows=await db.marketplaceStockHold.findMany({where:{status:'HELD',expiresAt:{lte:now}},select:{requestId:true},orderBy:{expiresAt:'asc'},take:MARKETPLACE_HOLD_SWEEP_LIMIT})
 let released=0,conflicts=0
 for(const row of rows){try{const result=await transaction(tx=>releaseInTransaction(tx,row.requestId,null,now));if(result.changed){released++;await notifyAll(result.notices)}}catch(e){if(e&&typeof e==='object'&&'status' in e&&e.status===409){conflicts++;continue}throw e}}
 return {released,conflicts}
}
