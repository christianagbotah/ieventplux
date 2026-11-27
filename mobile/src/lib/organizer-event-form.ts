/** Native organizer draft contract. Never infer authorization from client role:
 * all create/edit requests remain verified against accepted memberships on server. */
export const EVENT_MANAGER_ROLES = ['OWNER','ADMIN','EVENT_MANAGER'] as const
export const EVENT_MODES = [
  {value:'PHYSICAL', label:'In person'},
  {value:'VIRTUAL', label:'Online'},
  {value:'HYBRID', label:'Hybrid'},
] as const
export const EVENT_VISIBILITY = [
  {value:'PUBLIC', label:'Public'},
  {value:'UNLISTED', label:'Unlisted'},
  {value:'INVITE_ONLY', label:'Invite only'},
] as const
export type EventMode = typeof EVENT_MODES[number]['value']
export type EventVisibility = typeof EVENT_VISIBILITY[number]['value']
export type EventDraftForm = {
  title: string
  summary: string
  description: string
  categorySlug: string
  country: string
  city: string
  mode: EventMode
  visibility: EventVisibility
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  repeatWeeks?:string
}
export const BLANK_EVENT_DRAFT: EventDraftForm = {
  title:'', summary:'', description:'', categorySlug:'community',country:'GH',city:'',
  mode:'PHYSICAL',visibility:'PUBLIC',startDate:'',startTime:'',endDate:'',endTime:'',
}
export function canManageNativeEvent(role: string): boolean {
  return (EVENT_MANAGER_ROLES as readonly string[]).includes(role)
}

/** Input is explicitly DEVICE local, not UTC or arbitrary city time.
 * Round-trip validation rejects JS Date auto-normalization (Feb 30 etc.). */
export function parseDeviceLocalDateTime(date: string, time: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  const clock = /^(\d{2}):(\d{2})$/.exec(time.trim())
  if (!match || !clock) return null
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3])
  const hour = Number(clock[1]), minute = Number(clock[2])
  if (year < 2024 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const value = new Date(year,month-1,day,hour,minute)
  if (Number.isNaN(value.getTime()) || value.getFullYear()!==year || value.getMonth()+1!==month ||
    value.getDate()!==day || value.getHours()!==hour || value.getMinutes()!==minute) return null
  return value
}
export function formatLocalDraftDateTime(iso: string): {date:string;time:string} {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return {date:'',time:''}
  const two=(n:number)=>String(n).padStart(2,'0')
  return {date:`${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`,time:`${two(d.getHours())}:${two(d.getMinutes())}`}
}
export function deviceTimeZone(): string {
  try {return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} catch {return 'UTC'}
}
export function validateEventDraft(form:EventDraftForm, editing=false):string|null {
  if (form.title.trim().length<3 || form.title.trim().length>140) return 'Enter an event title between 3 and 140 characters.'
  if (form.summary.trim().length>200) return 'The event summary must be 200 characters or fewer.'
  if (form.description.length>8000) return 'The event description must be 8,000 characters or fewer.'
  if (form.city.length>60) return 'The city must be 60 characters or fewer.'
  if (!/^[A-Za-z]{2}$/.test(form.country.trim())) return 'Enter a two-letter country code (for example GH).'
  if (!/^[a-z0-9_-]{1,40}$/.test(form.categorySlug)) return 'Choose a valid event category.'
  if (!EVENT_MODES.some(item=>item.value===form.mode)) return 'Choose a valid attendance mode.'
  if (!EVENT_VISIBILITY.some(item=>item.value===form.visibility)) return 'Choose a valid visibility setting.'
  if (editing) return null
  if(form.repeatWeeks&&(!/^\d{1,2}$/.test(form.repeatWeeks)||Number(form.repeatWeeks)>26))return 'Choose 0–26 extra weekly occurrences.'
  const start=parseDeviceLocalDateTime(form.startDate,form.startTime)
  const end=parseDeviceLocalDateTime(form.endDate,form.endTime)
  if (!start || !end) return 'Enter real start and end dates (YYYY-MM-DD) and times (24-hour HH:MM).'
  if (end.getTime()<=start.getTime()) return 'The event must end after it starts.'
  if (start.getTime()<Date.now()-60_000) return 'The event start must be in the future.'
  return null
}
export function newEventDraftPayload(orgId:string, form:EventDraftForm) {
  const start=parseDeviceLocalDateTime(form.startDate,form.startTime)
  const end=parseDeviceLocalDateTime(form.endDate,form.endTime)
  if (!start || !end) throw new Error('Validate the event dates before creating a draft.')
  return {
    orgId, title:form.title.trim(),summary:form.summary.trim(),description:form.description.trim(),
    categorySlug:form.categorySlug,country:form.country.trim().toUpperCase(),city:form.city.trim(),
    mode:form.mode,visibility:form.visibility,timezone:deviceTimeZone(),
    startsAt:start.toISOString(),endsAt:end.toISOString(),repeatWeeks:Number(form.repeatWeeks||0),
  }
}
export function editEventDraftPayload(form:EventDraftForm) {
  // PATCH endpoint intentionally does NOT accept visibility/date changes in
  // this form. The native UI must not silently move or republish an event.
  return {title:form.title.trim(),summary:form.summary.trim(),description:form.description.trim(),
    categorySlug:form.categorySlug,city:form.city.trim(),mode:form.mode}
}
