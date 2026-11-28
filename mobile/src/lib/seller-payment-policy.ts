import type {NativeSellerPaymentPreferences,NativeSellerPaymentSettings} from '../api/client'
export function samePaymentPreferences(a:NativeSellerPaymentPreferences,b:NativeSellerPaymentPreferences){return a.mobileMoney===b.mobileMoney&&a.card===b.card&&a.cash===b.cash&&a.destination===b.destination}
export function canRequestSettlement(view:NativeSellerPaymentSettings|null,draft:NativeSellerPaymentPreferences|null,verified:boolean){return !!view&&!!draft&&verified&&samePaymentPreferences(view.preferences,draft)&&view.settlementStatus==='NOT_CONFIGURED'&&draft.destination==='BANK'&&(draft.mobileMoney||draft.card)}
export function formatCommission(bps:number|null){return typeof bps==='number'&&Number.isInteger(bps)&&bps>=0&&bps<=9999?(bps/100).toFixed(2)+'%':'Not configured'}
