/** Pure display rules; server remains authoritative for eligibility and inventory. */
export function eventDemandOpen(status:string, startsAt:string, now=Date.now()) {
  return status==='PUBLISHED' && Number.isFinite(Date.parse(startsAt)) && Date.parse(startsAt)>now
}
export function allTicketsSoldOut(types: readonly {active:boolean;quota:number;soldCount:number;reservedCount:number}[]) {
  const active=types.filter(t=>t.active)
  return active.length>0 && active.every(t=>t.quota>0 && t.soldCount+t.reservedCount>=t.quota)
}
export function canJoinDemandWaitlist(input:{open:boolean;soldOut:boolean;status?:string|null}) {
  return input.open && input.soldOut && input.status!=='WAITING' && input.status!=='CONVERTED'
}
export function waitlistPartySize(text:string) {
  if(!/^[0-9]{1,2}$/.test(text))return null
  const n=Number(text)
  return n>=1&&n<=10?n:null
}
export function demandDenied(status:number) {return status===401||status===403||status===404}
