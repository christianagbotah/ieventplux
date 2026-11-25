'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {api} from '../api'
import {navigate,type Route} from '../router'
import {usePortal} from '../store'
type Enquiry={id:string;providerId:string;description:string;community:string;status:string;quoteMinor:number|null;quoteNote:string|null;quoteExpiresAt:string|null;role:'CUSTOMER'|'PROVIDER';provider:{displayName:string;category:string};customer:{displayName:string}}
const money=(n:number)=>'₵'+(n/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
const amount=(s:string)=>/^\d{1,7}(\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):0
export default function ServiceEnquiries({route}:{route:Route}){
 const {user,booted}=usePortal()
 const providerId=route.query.get('provider')||''
 const [rows,setRows]=useState<Enquiry[]>([]),[description,setDescription]=useState(''),[community,setCommunity]=useState('')
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[price,setPrice]=useState(''),[note,setNote]=useState('')
 const retry=useRef(new Map<string,string>())
 const load=useCallback(async()=>{try{setRows((await api.get<{items:Enquiry[]}>('/service-enquiries')).items)}catch(e){setRows([]);setMessage(e instanceof Error?e.message:'Enquiries unavailable.')}},[])
 useEffect(()=>{setRows([]);if(booted&&user)void load()},[booted,user?.id,load])
 async function send(){
  const fingerprint=JSON.stringify([providerId,description.trim(),community.trim()])
  if(!retry.current.has(fingerprint))retry.current.set(fingerprint,crypto.randomUUID())
  setBusy(true);setMessage('')
  try{await api.post('/service-enquiries',{providerId,description,community,requestKey:retry.current.get(fingerprint)});retry.current.delete(fingerprint);setDescription('');setCommunity('');navigate('/services/enquiries',{replace:true});await load();setMessage('Enquiry sent. No booking or payment has been made.')}catch(e){setMessage(e instanceof Error?e.message:'Enquiry failed.')}finally{setBusy(false)}
 }
 async function decide(id:string,action:string){
  setBusy(true);setMessage('')
  try{await api.patch('/service-enquiries/'+encodeURIComponent(id),action==='QUOTE'?{action,quoteMinor:amount(price),quoteNote:note}:{action});setSelected('');setPrice('');setNote('');await load();setMessage('Decision saved. No payment or booking has been made.')}catch(e){setMessage(e instanceof Error?e.message:'Update failed.')}finally{setBusy(false)}
 }
 return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 pb-24"><div className="rounded-3xl bg-emerald-950 p-7 text-white"><p className="text-xs font-bold tracking-widest text-emerald-200">PLUXSERVICES · QUOTATIONS</p><h1 className="mt-2 text-3xl font-bold">Service enquiries</h1><p className="mt-3 text-sm text-emerald-100">Discuss the scope and review a price privately. Quotes are non-binding and expire after 24 hours.</p><Button className="mt-4" variant="secondary" onClick={()=>navigate('/services')}>Find providers</Button></div>
 {message&&<p role="status" className="rounded-xl border p-4 text-sm">{message}</p>}
 {!booted?<p>Checking your session…</p>:!user?<Button onClick={()=>navigate('/signin')}>Sign in to continue</Button>:<>
 {providerId&&<Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h2 className="text-xl font-bold">Request a quotation</h2><p className="text-sm text-muted-foreground">Describe the work and general community only. Do not include phone numbers, private addresses, medical information or identity documents.</p><Label htmlFor="enquiry-community">Community</Label><Input id="enquiry-community" maxLength={100} value={community} onChange={e=>setCommunity(e.target.value)}/><Label htmlFor="enquiry-description">Service needed</Label><Textarea id="enquiry-description" maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/><Button disabled={busy||community.trim().length<2||description.trim().length<10} onClick={()=>void send()}>Send private enquiry</Button></CardContent></Card>}
 <h2 className="text-xl font-bold">Incoming and outgoing enquiries</h2>
 {!rows.length&&<p className="text-sm text-muted-foreground">No enquiries yet.</p>}
 {rows.map(r=><Card key={r.id} className="rounded-2xl"><CardContent className="space-y-3 p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{r.role==='CUSTOMER'?r.provider.displayName:r.customer.displayName}</h3><span className="rounded-lg bg-muted px-3 py-1 text-xs">{r.status.replaceAll('_',' ').toLowerCase()}</span></div><p className="text-sm">{r.community} · {r.provider.category.toLowerCase().replaceAll('_',' ')}</p><p className="whitespace-pre-wrap break-words text-sm">{r.description}</p>{r.quoteMinor!==null&&<div className="rounded-xl border bg-muted/40 p-3"><p className="text-xl font-bold">{money(r.quoteMinor)}</p><p className="break-words text-sm">{r.quoteNote}</p><p className="text-xs text-muted-foreground">Quote expiry: {r.quoteExpiresAt?new Date(r.quoteExpiresAt).toLocaleString():'Unknown'} · non-binding</p></div>}
 {r.role==='PROVIDER'&&r.status==='REQUESTED'&&<>{selected===r.id?<div className="space-y-2"><Label htmlFor={'quote-'+r.id}>Quoted price (₵)</Label><Input id={'quote-'+r.id} inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="150.00"/><Textarea value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="What this price includes"/><Button disabled={busy||amount(price)<1||amount(price)>100000000||note.trim().length<2} onClick={()=>void decide(r.id,'QUOTE')}>Send quotation</Button></div>:<div className="flex flex-wrap gap-2"><Button onClick={()=>{setSelected(r.id);setPrice('');setNote('')}} disabled={busy}>Prepare quote</Button><Button variant="outline" disabled={busy} onClick={()=>void decide(r.id,'DECLINE')}>Decline enquiry</Button></div>}</>}
 {r.role==='CUSTOMER'&&r.status==='QUOTED'&&<div className="flex flex-wrap gap-2"><Button disabled={busy||!r.quoteExpiresAt||Date.parse(r.quoteExpiresAt)<=Date.now()} onClick={()=>void decide(r.id,'ACCEPT_QUOTE')}>Accept quote (non-binding)</Button><Button variant="outline" disabled={busy} onClick={()=>void decide(r.id,'DECLINE_QUOTE')}>Decline quote</Button></div>}
 {r.role==='CUSTOMER'&&['REQUESTED','QUOTED'].includes(r.status)&&<Button variant="outline" disabled={busy} onClick={()=>void decide(r.id,'WITHDRAW')}>Withdraw enquiry</Button>}
 </CardContent></Card>)}</>}
 </main>
}
