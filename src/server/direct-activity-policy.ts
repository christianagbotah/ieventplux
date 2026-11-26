export const ACTIVE_MS=20_000
export const TYPING_MS=8_000
export function activityWindow(now:Date,typing:boolean){
 return {activeUntil:new Date(+now+ACTIVE_MS),typingUntil:typing?new Date(+now+TYPING_MS):null}
}
export function parseActivity(raw:unknown){
 if(!raw||typeof raw!=='object')return null
 const v=raw as Record<string,unknown>
 if(typeof v.share!=='boolean'||typeof v.typing!=='boolean'||(!v.share&&v.typing))return null
 return {share:v.share,typing:v.typing}
}
