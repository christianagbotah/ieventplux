'use client'
import {useCallback,useEffect,useState} from 'react'
import {CalendarDays,Clock3} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {api} from '../api'
type Appointment={id:string;enquiryId:string;startsAt:string;endsAt:string;status:string;role:'CUSTOMER'|'PROVIDER';provider:{displayName:string};customer:{displayName:string}}
type Enquiry={id:string;role:'CUSTOMER'|'PROVIDER';status:string;quoteExpiresAt:string|null;provider:{displayName:string}}
const display=(s:string)=>new Date(s).toLocaleString('en-GH',{timeZone:'Africa/Accra',dateStyle:'medium',timeStyle:'short'})
export function ServiceAppointments({enquiries}:{enquiries:Enquiry[]}){
 const [rows,setRows]=useState<Appointment[]>([]),[selected,setSelected]=useState(''),[slot,setSlot]=useState(''),[duration,setDuration]=useState(60),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[ready,setReady]=useState(false)
 const load=useCallback(async()=>{try{setRows((await api.get<{items:Appointment[]}>('/service-appointments')).items);setReady(true)}catch(e){setReady(false);setNotice(e instanceof Error?e.message:'Appointments unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 const choices=enquiries.filter(e=>e.role==='CUSTOMER'&&e.status==='QUOTE_ACCEPTED'&&e.quoteExpiresAt&&Date.parse(e.quoteExpiresAt)>Date.now()&&!rows.some(r=>r.enquiryId===e.id))
 async function request(){
  setBusy(true);setNotice('')
  try{const startsAt=new Date(slot+':00.000Z').toISOString();await api.post('/service-appointments',{enquiryId:selected,startsAt,durationMinutes:duration});setSelected('');setSlot('');await load();setNotice('Appointment request sent. Await provider confirmation; no payment or dispatch.')}catch(e){setNotice(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}
 }
 async function decide(id:string,action:string){
  setBusy(true);setNotice('')
  try{await api.patch('/service-appointments/'+encodeURIComponent(id),{action});await load();setNotice('Appointment updated.')}catch(e){setNotice(e instanceof Error?e.message:'Update failed.')}finally{setBusy(false)}
 }
 return <section className="space-y-4"><h2 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="size-5 text-primary"/> Service appointments</h2><p className="text-sm text-muted-foreground">Propose a future time after accepting a current quote. Confirmation coordinates a time only; payment and dispatch remain disabled. All times below are Ghana time (UTC).</p>
 {notice&&<p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
 {ready&&choices.length>0&&<Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><Label htmlFor="appointment-enquiry">Accepted quotation</Label><select id="appointment-enquiry" className="h-11 w-full rounded-md border bg-background px-3" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose provider</option>{choices.map(q=><option key={q.id} value={q.id}>{q.provider.displayName}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="appointment-time">Proposed date and time (Ghana)</Label><Input id="appointment-time" type="datetime-local" value={slot} onChange={e=>setSlot(e.target.value)}/></div><div><Label htmlFor="appointment-duration">Estimated duration</Label><select id="appointment-duration" className="h-10 w-full rounded-md border bg-background px-3" value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[15,30,45,60,90,120,180,240,360,480].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></div></div><Button disabled={busy||!selected||!slot} onClick={()=>void request()}>Request appointment</Button></CardContent></Card>}
 {ready&&!rows.length&&<p className="text-sm text-muted-foreground">No appointments yet.</p>}
 {rows.map(r=><Card key={r.id} className="rounded-2xl"><CardContent className="space-y-3 p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{r.role==='CUSTOMER'?r.provider.displayName:r.customer.displayName}</h3><span className="rounded-lg bg-muted px-3 py-1 text-xs">{r.status.toLowerCase()}</span></div><p className="flex items-center gap-2 text-sm"><Clock3 className="size-4"/>{display(r.startsAt)} — {display(r.endsAt)}</p><div className="flex flex-wrap gap-2">{r.role==='PROVIDER'&&r.status==='REQUESTED'&&<><Button disabled={busy||Date.parse(r.startsAt)<=Date.now()} onClick={()=>void decide(r.id,'CONFIRM')}>Confirm time</Button><Button variant="outline" disabled={busy} onClick={()=>void decide(r.id,'DECLINE')}>Decline</Button></>}{['REQUESTED','CONFIRMED'].includes(r.status)&&Date.parse(r.startsAt)>Date.now()&&<Button variant="outline" disabled={busy} onClick={()=>void decide(r.id,'CANCEL')}>Cancel appointment</Button>}</div></CardContent></Card>)}
 </section>
}
