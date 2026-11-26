export function canonicalPair(a:string,b:string){
 return a<b?{participantLowId:a,participantHighId:b}:{participantLowId:b,participantHighId:a}
}
export function validDirectId(value:unknown):value is string{
 return typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)
}
export function parseDirectMessage(raw:unknown){
 if(!raw||typeof raw!=='object')return null
 const v=raw as Record<string,unknown>
 if(typeof v.body!=='string'||typeof v.clientKey!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(v.clientKey))return null
 const body=v.body.trim()
 if(!body||body.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))return null
 return {body,clientKey:v.clientKey}
}
export function mayDecide(status:string,requesterId:string,actorId:string){
 return status==='PENDING'&&requesterId!==actorId
}
