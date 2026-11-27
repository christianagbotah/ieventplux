export function pollDraft(question:string,options:string[]){
 const title=question.trim(),values=options.map(x=>x.trim()).filter(Boolean)
 if(title.length<4||title.length>140||values.length<2||values.length>6||values.some(x=>x.length>40)||new Set(values).size!==values.length)return null
 return {question:title,options:values}
}
export function votePercent(votes:number,total:number){return Number.isFinite(votes)&&Number.isFinite(total)&&total>0?Math.max(0,Math.min(100,Math.round(votes/total*100))):0}
export function canVotePoll(eventStatus:string,pollStatus:string,myOptionId:string|null){return eventStatus==='LIVE'&&pollStatus==='OPEN'&&!myOptionId}
