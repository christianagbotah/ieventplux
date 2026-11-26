export type PendingText={owner:string;conversationId:string;key:string;body:string;createdAt:number}
const ID=/^[A-Za-z0-9_-]{1,128}$/
export const MAX_RETRY_AGE=24*60*60*1000
export function validPendingText(raw:unknown,owner:string,now=Date.now()):PendingText|null{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Record<string,unknown>
 if(r.owner!==owner||typeof r.conversationId!=='string'||!ID.test(r.conversationId)||typeof r.key!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(r.key)||typeof r.body!=='string'||!r.body.trim()||r.body.length>4000||typeof r.createdAt!=='number'||!Number.isFinite(r.createdAt)||r.createdAt>now+60000||now-r.createdAt>MAX_RETRY_AGE)return null
 return {owner,conversationId:r.conversationId,key:r.key,body:r.body,createdAt:r.createdAt}
}
export function safeJournalSize(record:PendingText){
 // Conservative encoded length avoids platform SecureStore's ~2KB legacy limit.
 return encodeURIComponent(JSON.stringify(record)).length<=1800
}
