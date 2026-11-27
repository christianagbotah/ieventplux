const weekMs=7*86400000
export function parseRepeatWeeks(raw:unknown):number|null{
 if(raw===undefined||raw===null||raw==='')return 0
 if(typeof raw!=='number'&&typeof raw!=='string')return null
 if(typeof raw==='string'&&!/^\d{1,2}$/.test(raw))return null
 const n=Number(raw)
 return Number.isInteger(n)&&n>=0&&n<=26?n:null
}
export function eventTimezone(raw:unknown):string|null{
 if(typeof raw!=='string'||!raw||raw.length>60)return null
 try{return new Intl.DateTimeFormat('en-US',{timeZone:raw}).resolvedOptions().timeZone}catch{return null}
}
export function eventInstant(raw:unknown):Date|null{
 if(typeof raw!=='string')return null
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw)
 if(!m)return null
 const [y,mo,d,h,mi,s]=m.slice(1,7).map(n=>Number(n??0))
 if(y<1900||y>2200||h>23||mi>59||s>59)return null
 const probe=new Date(Date.UTC(y,mo-1,d))
 if(probe.getUTCFullYear()!==y||probe.getUTCMonth()+1!==mo||probe.getUTCDate()!==d)return null
 const result=new Date(raw)
 return Number.isFinite(+result)?result:null
}
function wall(date:Date,zone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date)
 const n=(type:string)=>Number(parts.find(p=>p.type===type)?.value)
 return Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'),date.getUTCMilliseconds())
}
/** Preserve both local start and end clock times; reject DST gaps/overlaps
 * instead of silently moving a future occurrence to another time. */
function resolveWall(target:number,zone:string){
 const offsets=new Set([-36,-12,0,12,36].map(h=>{const t=target+h*3600000;return wall(new Date(t),zone)-t}))
 const candidates=[...offsets].map(offset=>target-offset).filter(t=>wall(new Date(t),zone)===target)
 return candidates.length===1?new Date(candidates[0]!):null
}
export function weeklyEventOccurrences(start:Date,end:Date,zone:string,count:number){
 const result:{startsAt:Date;endsAt:Date}[]=[]
 for(let i=1;i<=count;i++){
  const startsAt=resolveWall(wall(start,zone)+i*weekMs,zone),endsAt=resolveWall(wall(end,zone)+i*weekMs,zone)
  if(!startsAt||!endsAt||endsAt<=startsAt)return null
  result.push({startsAt,endsAt})
 }
 return result
}
