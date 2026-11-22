/** Event schedule UI uses the event's configured IANA timezone.
 * A naive local time is never silently interpreted in the viewer's device
 * timezone. Nonexistent and ambiguous DST times are rejected.
 */
export type AgendaForm = {
  title: string; startsAt: string; endsAt: string;
  speaker: string; description: string; sortOrder: string
}

type DateParts = { year:number; month:number; day:number; hour:number; minute:number }
const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

function asLocalParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map(item=>[item.type,item.value]))
  return {
    year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),
    hour:Number(parts.hour),minute:Number(parts.minute),
  }
}
function textParts(local:string): DateParts | null {
  const match = pattern.exec(local)
  if (!match) return null
  const [,y,mo,d,h,mi]=match.map(Number)
  const utc = new Date(Date.UTC(y,mo-1,d,h,mi))
  if (utc.getUTCFullYear()!==y || utc.getUTCMonth()+1!==mo ||
    utc.getUTCDate()!==d || utc.getUTCHours()!==h || utc.getUTCMinutes()!==mi) return null
  return {year:y,month:mo,day:d,hour:h,minute:mi}
}
function utcApprox(parts: DateParts): number {
  return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute)
}
export function agendaTimeZoneValid(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-GB',{timeZone:zone}).format(new Date());return true }
  catch {return false}
}
export function agendaUtcToLocal(value: string, timeZone:string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const p=asLocalParts(date,timeZone)
  return `${p.year.toString().padStart(4,'0')}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}T${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`
}
export function agendaLocalToUtc(local: string, timeZone:string): string {
  const wanted=textParts(local)
  if (!wanted) throw new Error('Choose a valid date and time.')
  if (!agendaTimeZoneValid(timeZone)) throw new Error('Event timezone is invalid. Update the event first.')
  const guess=utcApprox(wanted)
  const offsets=new Set<number>()
  for(const delta of [-86400000,0,86400000]){
    const timestamp=guess+delta
    const parts=asLocalParts(new Date(timestamp),timeZone)
    offsets.add((utcApprox(parts)-timestamp)/60000)
  }
  const candidates:string[]=[]
  for(const offset of offsets) {
    const instant=guess-offset*60000
    const p=asLocalParts(new Date(instant),timeZone)
    if(p.year===wanted.year&&p.month===wanted.month&&p.day===wanted.day&&p.hour===wanted.hour&&p.minute===wanted.minute) {
      candidates.push(new Date(instant).toISOString())
    }
  }
  if(candidates.length===0) throw new Error('This local time does not exist because of a daylight-saving change. Choose another time.')
  if(candidates.length>1) throw new Error('This local time occurs twice due to daylight saving. Choose an unambiguous time.')
  return candidates[0]
}
export function agendaFormError(form:AgendaForm,timeZone:string):string|null{
  if(form.title.trim().length<2) return 'Add a session title (at least 2 characters).'
  if(!form.startsAt) return 'Choose the session start date and time.'
  try{
    const start=agendaLocalToUtc(form.startsAt,timeZone)
    if(form.endsAt) {
      const end=agendaLocalToUtc(form.endsAt,timeZone)
      if(new Date(end).getTime()<=new Date(start).getTime()) return 'Session finish must be later than start.'
    }
  }catch(err){return err instanceof Error?err.message:'Invalid event time.'}
  if(!/^\d+$/.test(form.sortOrder)||Number(form.sortOrder)>1000) return 'Display order must be a whole number from 0 to 1,000.'
  return null
}
