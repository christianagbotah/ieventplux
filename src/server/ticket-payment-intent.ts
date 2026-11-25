import {paymentIntentSnapshot} from './platform-payment-intent'
type TicketOrder={id:string;reference:string;orgId:string;kind:string;currency:string;totalMinor:number;platformFeeMinor:number;feeVersionId:string|null;feeSnapshot:string}
/** Legacy checkout shadow record only. Never used as evidence of collection or
 * eligibility, and never assigned a TEST reference. Existing payment remains unchanged. */
export function ticketOrderShadowIntent(order:TicketOrder){
 if(order.kind!=='PAID'||order.currency!=='GHS'||!order.feeVersionId||!Number.isSafeInteger(order.totalMinor)||order.totalMinor<=0||order.totalMinor>100_000_000||!Number.isSafeInteger(order.platformFeeMinor)||order.platformFeeMinor<0||order.platformFeeMinor>=order.totalMinor)return null
 let fee
 try{fee=JSON.parse(order.feeSnapshot)}catch{return null}
 if(!fee||fee.feeVersionId!==order.feeVersionId||fee.currency!=='GHS'||!Number.isInteger(fee.ticketCommissionBp)||fee.ticketCommissionBp<0||fee.ticketCommissionBp>9999||Math.round(order.totalMinor*fee.ticketCommissionBp/10000)!==order.platformFeeMinor)return null
 return paymentIntentSnapshot({purpose:'EVENT_TICKET',sourceId:order.id,reference:'PLAN-'+order.reference,currency:'GHS',totalMinor:order.totalMinor,commissionMinor:order.platformFeeMinor,beneficiary:{kind:'ORGANIZATION',id:order.orgId},pricingVersion:'legacy-shadow:'+order.feeVersionId})
}
