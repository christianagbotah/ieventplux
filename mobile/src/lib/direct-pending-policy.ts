export type PendingText={userId:string;conversationId:string;body:string;key:string;createdAt:number}
export const MAX_PENDING_AGE=24*60*60*1000
export function pendingRecord(value:unknown,userId:string,conversationId:string,now=Date.now()):PendingText|null{
 if(!value||typeof value!=='object')return null
 const v=value as Record<string,unknown>
 if(v.userId!==userId||v.conversationId!==conversationId||typeof v.body!=='string'||!v.body.trim()||v.body.length>4000||typeof v.key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(v.key)||typeof v.createdAt!=='number'||!Number.isFinite(v.createdAt)||v.createdAt>now+60000||now-v.createdAt>MAX_PENDING_AGE)return null
 return {userId,conversationId,body:v.body,key:v.key,createdAt:v.createdAt}
}
export function pendingChunks(value:PendingText){
 // 400 Unicode code points per value: at most 1600 UTF-8 bytes each.
 const chars=Array.from(JSON.stringify(value)),chunks:string[]=[]
 for(let i=0;i<chars.length;i+=400)chunks.push(chars.slice(i,i+400).join(''))
 if(chunks.length>64)throw new Error('Pending message exceeds secure storage limit.')
 return chunks
}
