export const CALL_STATUS_FRESH_MS=15000
export function callDeadline(expiresAt:string,serverNow:string|undefined,receivedAt:number){
 const expiry=Date.parse(expiresAt),server=serverNow?Date.parse(serverNow):NaN
 if(!Number.isFinite(expiry)||!Number.isFinite(server))return 0
 // Clamp to the maximum invitation lease. Local clock offsets cannot extend it.
 return receivedAt+Math.max(0,Math.min(120000,expiry-server))
}
export function callSeconds(deadline:number,now:number){return Math.max(0,Math.ceil((deadline-now)/1000))}
export function callStatusFresh(lastSeen:number,now:number){return lastSeen>0&&now>=lastSeen&&now-lastSeen<=CALL_STATUS_FRESH_MS}
export function showIncomingForThread(visible:boolean,currentThread:string|undefined,conversationId:string){return visible&&currentThread!==conversationId}
