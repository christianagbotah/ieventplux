export const directReportReasons=['SPAM','OFFENSIVE','FRAUD','OTHER'] as const
export type DirectReportReason=typeof directReportReasons[number]
export function parseDirectReport(raw:unknown){
 if(!raw||typeof raw!=='object')return null
 const v=raw as Record<string,unknown>
 if(typeof v.reason!=='string'||!directReportReasons.includes(v.reason as DirectReportReason))return null
 if(v.details!==undefined&&(typeof v.details!=='string'||v.details.length>1000))return null
 return {reason:v.reason as DirectReportReason,details:typeof v.details==='string'?v.details.trim()||null:null}
}
export const removedMessageBody='[Message removed by moderation]'
