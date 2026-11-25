'use client'
import {useCallback,useEffect,useState,useRef} from 'react'
import {Car,MapPin,Search,ShieldCheck,BriefcaseBusiness,Clock3} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {api} from '../api'
import {usePortal} from '../store'
import {navigate} from '../router'
import {SERVICE_CATEGORIES} from '@/server/service-directory-policy'
type Listing={id:string;displayName:string;category:string;community:string;availability:string;lastConfirmedAt:string|null}
type Profile={id:string;displayName:string;category:string;community:string;reviewStatus:string;published:boolean;availabilityState:string;availableUntil:string|null}
const label=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())
export default function ServiceDirectory({manage=false}:{manage?:boolean}){
 const {user,booted}=usePortal()
 const [category,setCategory]=useState(''),[community,setCommunity]=useState('')
 const [items,setItems]=useState<Listing[]>([]),[mine,setMine]=useState<Profile[]>([])
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[name,setName]=useState(''),[description,setDescription]=useState('')
 const [regCategory,setRegCategory]=useState(''),[regCommunity,setRegCommunity]=useState('')
 const rev=useRef(0)
 const [clock,setClock]=useState(Date.now())
 useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),10000);return()=>clearInterval(t)},[])
 const load=useCallback(async(cat:string,area:string)=>{
  const token=++rev.current;setBusy(true);setMessage('')
  try{const data=await api.get<{items:Listing[]}>('/service-providers/discover?'+new URLSearchParams({country:'GH',category:cat,community:area}));if(token===rev.current)setItems(data.items)}catch(e){if(token===rev.current){setItems([]);setMessage(e instanceof Error?e.message:'Directory unavailable.')}}finally{if(token===rev.current)setBusy(false)}
 },[])
 const history=useCallback(async()=>{try{const r=await api.get<{items:Profile[]}>('/service-providers');setMine(r.items)}catch(e){setMine([]);setMessage(e instanceof Error?e.message:'Could not load profiles.')}},[])
 useEffect(()=>{if(!manage)void load('','');else if(booted&&user)void history();return()=>{rev.current++}},[manage,booted,user?.id,load,history])
 async function enroll(){
  setBusy(true);setMessage('')
  try{await api.post('/service-providers',{category:regCategory,country:'GH',community:regCommunity,displayName:name,serviceDescription:description});setName('');setRegCategory('');setDescription('');setRegCommunity('');await history();setMessage('Registration submitted. Your profile remains private pending review.')}catch(e){setMessage(e instanceof Error?e.message:'Registration failed.')}finally{setBusy(false)}
 }
 async function action(id:string,action:string){
  setBusy(true);setMessage('')
  try{await api.patch('/service-providers/'+encodeURIComponent(id),{action});await history()}catch(e){setMessage(e instanceof Error?e.message:'Update failed.')}finally{setBusy(false)}
 }
 return <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 pb-24">
 <section className="relative overflow-hidden rounded-3xl bg-emerald-950 p-6 text-white sm:p-9"><div className="relative space-y-4"><p className="text-xs font-bold tracking-widest text-emerald-200">PLUXMOVE · PLUXSERVICES · PLUXUTILITIES</p><h1 className="text-3xl font-extrabold sm:text-5xl">{manage?'Your services. Your community.':'Find help close to home.'}</h1><p className="max-w-2xl text-sm leading-relaxed text-emerald-100">Discover local service providers or register your own business in the Ghana pilot. Community search only; transport and regulated services await credential certification.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>navigate(manage?'/services':'/services/manage')}>{manage?<Search className="mr-2 size-4"/>:<BriefcaseBusiness className="mr-2 size-4"/>}{manage?'Explore services':'Register or manage services'}</Button></div></div></section>
 {message&&<p role="status" className="rounded-xl border bg-card p-4 text-sm">{message}</p>}
 {!manage?<><Card className="rounded-2xl"><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div><Label htmlFor="provider-category">Service</Label><select id="provider-category" className="mt-1 h-11 w-full rounded-lg border bg-background px-3" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{SERVICE_CATEGORIES.map(c=><option key={c.id} value={c.id}>{label(c.id)}{c.regulated?' (pending certification)':''}</option>)}</select></div><div><Label htmlFor="provider-community">Community or town</Label><Input id="provider-community" className="mt-1 h-11" value={community} maxLength={100} onChange={e=>setCommunity(e.target.value)} placeholder="e.g. Dzodze"/></div><Button className="h-11" disabled={busy} onClick={()=>void load(category,community)}><Search className="mr-2 size-4"/>Find services</Button></CardContent></Card>
 <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Local providers</h2><p className="text-xs text-muted-foreground">Community-level results</p></div>
 {busy?<p>Loading providers…</p>:items.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(p=><Card key={p.id} className="rounded-2xl"><CardContent className="space-y-3 p-5"><div className="flex items-center gap-2 text-sm text-primary"><ShieldCheck className="size-4"/>Reviewed pilot profile</div><h3 className="text-xl font-bold">{p.displayName}</h3><p className="text-sm">{label(p.category)}</p><p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4"/>{p.community}</p><p className="flex items-center gap-2 text-sm"><Clock3 className="size-4"/>{p.availability==='AVAILABLE'&&p.lastConfirmedAt&&clock-Date.parse(p.lastConfirmedAt)<900000?'Recently confirmed available':'Availability unconfirmed'}</p></CardContent></Card>)}</div>:<div className="rounded-2xl border border-dashed p-10 text-center"><Car className="mx-auto mb-3 size-10 text-muted-foreground"/><h3 className="font-bold">No matching providers yet</h3><p className="mt-2 text-sm text-muted-foreground">Try another community or category. No dispatch or booking is active in this pilot.</p></div>}</>:!booted?<p>Checking your session…</p>:!user?<Card><CardContent className="p-6"><p>Sign in to register your service.</p><Button className="mt-3" onClick={()=>navigate('/signin')}>Sign in</Button></CardContent></Card>:<>
 <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h2 className="text-xl font-bold">Register a service</h2><p className="text-sm text-muted-foreground">Do not enter private addresses, credential numbers or sensitive information. Regulated categories are enrollment only.</p><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="reg-name">Business / provider name</Label><Input id="reg-name" value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></div><div><Label htmlFor="reg-cat">Category</Label><select id="reg-cat" className="h-10 w-full rounded-md border bg-background px-2" value={regCategory} onChange={e=>setRegCategory(e.target.value)}><option value="">Choose category</option>{SERVICE_CATEGORIES.map(c=><option key={c.id} value={c.id}>{label(c.id)}</option>)}</select></div><div><Label>Country</Label><Input value="Ghana" readOnly/></div><div><Label htmlFor="reg-area">Community</Label><Input id="reg-area" value={regCommunity} maxLength={100} onChange={e=>setRegCommunity(e.target.value)}/></div></div><Label htmlFor="reg-desc">Service description</Label><Textarea id="reg-desc" value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)}/><Button disabled={busy||!regCategory||name.trim().length<2||regCommunity.trim().length<2||description.trim().length<10} onClick={()=>void enroll()}>Submit private registration</Button></CardContent></Card>
 <h2 className="text-xl font-bold">Your service profiles</h2>{mine.length===0&&<p className="text-muted-foreground text-sm">No service profiles yet.</p>}
 {mine.map(p=><Card key={p.id} className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="font-bold">{p.displayName}</h3><p className="text-sm">{label(p.category)} · {p.community} · {label(p.reviewStatus)} · {p.published?'Public':'Private'}</p><p className="text-sm">Availability: {p.availabilityState==='AVAILABLE'&&p.availableUntil&&Date.parse(p.availableUntil)>clock?'Available until '+new Date(p.availableUntil).toLocaleTimeString():'Not confirmed available'}</p><div className="flex flex-wrap gap-2">{p.reviewStatus==='APPROVED'&&!p.published&&<Button disabled={busy} onClick={()=>void action(p.id,'PUBLISH')}>Publish profile</Button>}{p.published&&<><Button disabled={busy} onClick={()=>void action(p.id,'AVAILABLE')}>Available for 15 minutes</Button><Button variant="outline" disabled={busy} onClick={()=>void action(p.id,'OFFLINE')}>Go offline</Button><Button variant="outline" disabled={busy} onClick={()=>void action(p.id,'UNPUBLISH')}>Make private</Button></>}</div></CardContent></Card>)}</>}
 </main>
}
