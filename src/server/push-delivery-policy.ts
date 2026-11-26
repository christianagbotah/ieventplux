export const PUSH_TTL_MS = 5 * 60_000
export const RECEIPT_DELAY_MS = 15 * 60_000
export const RECEIPT_DEADLINE_MS = 23 * 60 * 60_000
export const MAX_PUSH_ATTEMPTS = 3
export function pushTransportConfigured(env: Record<string,string|undefined>) {
 return env.IEVENTPLUX_PUSH_DELIVERY_ENABLED === 'true' && !!env.EXPO_PUSH_ACCESS_TOKEN?.trim()
}
export function optedIn(raw: string) {
 try {const p=JSON.parse(raw);return !!p&&p.push===true}catch{return false}
}
export function genericEnvelope(token:string) {
 return {to:token,title:'iEventPlux',body:'You have new activity. Open iEventPlux to view it.',channelId:'activity',ttl:300,priority:'default' as const}
}
const allowedErrors = new Set(['DeviceNotRegistered','MessageRateExceeded','MessageTooBig','MismatchSenderId','InvalidCredentials'])
export type SendResult =
 | {kind:'accepted';ticketId:string}
 | {kind:'retry';code:string}
 | {kind:'failed';code:string}
 | {kind:'unknown';code:string}
export type ReceiptResult = {kind:'ok'}|{kind:'pending'}|{kind:'failed';code:string}
function asObject(value:unknown):Record<string,unknown>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
}
function safeCode(value:unknown){
 const code=asObject(asObject(value).details).error
 return typeof code==='string'&&allowedErrors.has(code)?code:'PROVIDER_REJECTED'
}
export function classifyTicket(status:number,raw:unknown):SendResult{
 if(status===429)return {kind:'retry',code:'RATE_LIMIT'}
 if(status>=500||status<200||status>=300){
  return status>=400&&status<500?{kind:'failed',code:'HTTP_REJECTED'}:{kind:'unknown',code:'HTTP_AMBIGUOUS'}
 }
 const data=asObject(raw).data
 const ticket=asObject(Array.isArray(data)&&data.length===1?data[0]:data)
 if(ticket.status==='ok'&&typeof ticket.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(ticket.id))return {kind:'accepted',ticketId:ticket.id}
 if(ticket.status==='error'){
  const code=safeCode(ticket)
  return code==='MessageRateExceeded'?{kind:'retry',code}:{kind:'failed',code}
 }
 return {kind:'unknown',code:'UNRECOGNIZED_TICKET'}
}
export function classifyReceipt(raw:unknown):ReceiptResult{
 const receipt=asObject(raw)
 if(receipt.status==='ok')return {kind:'ok'}
 if(receipt.status==='error')return {kind:'failed',code:safeCode(receipt)}
 return {kind:'pending'}
}
