import {Prisma} from '@prisma/client'
import {db} from '@/lib/db'
import {errors} from '@/server/api'
import {heldSelections} from '../marketplace-hold-policy'
import {checkoutDraftEnabled,matchesHeldLines,reviewedCheckoutTotal} from '../marketplace-checkout-draft-policy'
import {publishNotification} from './notify'
export const checkoutDraftView={id:true,status:true,currency:true,totalMinor:true,unitCount:true,items:true,createdAt:true,closedAt:true} as const
/** Buyer review only. No provider interaction, payment intent, sale or settlement. */
export async function prepareMarketplaceCheckout(requestId:string,buyerId:string,raw:unknown){
 if(!checkoutDraftEnabled(process.env))throw errors.unavailable('CHECKOUT_DRAFT_DISABLED','Checkout preparation is not available yet.')
 const total=reviewedCheckoutTotal(raw);if(total===null)throw errors.badRequest('Review the held basket total before continuing.')
 try{
 const result=await db.$transaction(async tx=>{
  const row=await tx.marketplacePurchaseRequest.findUnique({where:{id:requestId},include:{store:{select:{ownerId:true,id:true,status:true,deletedAt:true,currency:true,slug:true}},stockHold:{include:{lines:true,checkoutDraft:{select:checkoutDraftView}}}}})
  if(!row||row.buyerId!==buyerId)throw errors.notFound('Purchase request not found.')
  const hold=row.stockHold;if(!hold||hold.status!=='HELD'||hold.expiresAt<=new Date()||row.status!=='ACKNOWLEDGED'||row.store.status!=='ACTIVE'||row.store.deletedAt)throw errors.conflict('An active stock reservation is required.')
  if(total!==row.totalMinor||row.currency!==row.store.currency)throw errors.conflict('Reviewed price has changed. Refresh and review again.')
  if(!await tx.user.findFirst({where:{id:buyerId,status:'ACTIVE',deletedAt:null},select:{id:true}}))throw errors.forbidden('Active buyer account required.')
  if(hold.checkoutDraft)return {draft:hold.checkoutDraft,notice:null,replayed:true}
  let review;try{review=heldSelections(row)}catch{throw errors.conflict('The saved request is invalid.')}
  if(!matchesHeldLines(review.items,hold.lines))throw errors.conflict('Stock reservation requires reconciliation.')
  const variants=await tx.marketplaceVariant.findMany({where:{id:{in:review.items.map(x=>x.variantId)},storeId:row.store.id,active:true,product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},select:{id:true,stockOnHand:true,stockReserved:true,priceMinor:true,currency:true}})
  if(review.items.some(x=>{const v=variants.find(y=>y.id===x.variantId);return !v||v.priceMinor!==x.expectedUnitPriceMinor||v.currency!==row.currency||v.stockReserved<x.quantity||v.stockOnHand<v.stockReserved}))throw errors.conflict('Held stock or catalogue price changed. Release the hold and request an updated quote.')
  const draft=await tx.marketplaceCheckoutDraft.create({data:{holdId:hold.id,currency:row.currency,totalMinor:row.totalMinor,unitCount:row.unitCount,items:row.items as Prisma.InputJsonValue},select:checkoutDraftView})
  await tx.auditLog.create({data:{actorUserId:buyerId,actorLabel:'marketplace-buyer',entityType:'MarketplaceCheckoutDraft',entityId:draft.id,action:'marketplace.checkout.prepare'}})
  const notice=await tx.notification.create({data:{userId:row.store.ownerId,type:'MARKETPLACE_REQUEST',title:'Buyer reviewed reserved items',body:'The buyer prepared a checkout draft. This is not an order, and no payment was collected.',link:'#/shop/'+encodeURIComponent(row.store.slug)}})
  return {draft,notice,replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
 if(result.notice)await publishNotification(result.notice)
 return {draft:result.draft,replayed:result.replayed,checkoutEnabled:false,paymentCollected:false}
 }catch(e){if(e&&typeof e==='object'&&'code' in e&&['P2034','P2002'].includes(String(e.code)))throw errors.conflict('Reservation changed. Refresh and retry.');throw e}
}
