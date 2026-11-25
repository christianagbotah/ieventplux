'use client'
import {useEffect,useState} from 'react'
import {MapPin} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {api} from '../api'
import {navigate} from '../router'
import {GHANA_REGIONS} from '@/server/service-area-catalogue-policy'
type Area={id:string;name:string;region:string}
type Consent={consentedAt:string;revokedAt:string|null;area:Area&{active:boolean}}
type Result={id:string;displayName:string;community:string;region:string;category:string;proximity:string;availability:string}
export function ServiceAreaPanel({providerId,category=''}:{providerId?:string;category?:string}){
 const [region,setRegion]=useState(''),[query,setQuery]=useState(''),[areas,setAreas]=useState<Area[]>([]),[areaId,setAreaId]=useState(''),[consent,setConsent]=useState<Consent|null>(null),[optIn,setOptIn]=useState(false),[items,setItems]=useState<Result[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[searched,setSearched]=useState(false)
 const [consentLoaded,setConsentLoaded]=useState(!providerId)
 const base='/service-providers/'+encodeURIComponent(providerId||'')+'/area'
 useEffect(()=>{if(!providerId)return;let current=true;api.get<{consent:Consent|null}>(base).then(r=>{if(current){setConsent(r.consent);setConsentLoaded(true)}}).catch(e=>{if(current)setNotice(e instanceof Error?e.message:'Consent unavailable.')});return()=>{current=false}},[providerId,base])
 async function list(){
  setBusy(true);setNotice('');setAreaId('');setAreas([]);setItems([]);setSearched(false);setOptIn(false)
  try{setAreas((await api.get<{items:Area[]}>('/service-areas?'+new URLSearchParams({region,q:query}))).items);setSearched(true)}catch(e){setNotice(e instanceof Error?e.message:'Community catalogue unavailable.')}finally{setBusy(false)}
 }
 async function submit(){
  setBusy(true);setNotice('')
  try{if(providerId){const r=await api.post<{consent:Consent}>(base,{areaId,consent:true});setConsent(r.consent);setOptIn(false);setNotice('Service-area consent saved. You can revoke it at any time.')}else{setItems((await api.get<{items:Result[]}>('/service-providers/nearby?'+new URLSearchParams({areaId,category}))).items);setNotice('Search complete. Results describe community proximity, not a live position.')}}catch(e){setItems([]);setNotice(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}
 }
 async function revoke(){
  setBusy(true);setNotice('')
  try{await api.delete(base);setConsent(null);setOptIn(false);setNotice('Proximity consent withdrawn. Your ordinary directory listing is unchanged.')}catch(e){setNotice(e instanceof Error?e.message:'Revocation failed.')}finally{setBusy(false)}
 }
 return <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="flex items-center gap-2 font-bold"><MapPin className="size-5 text-primary"/>{providerId?'Optional service-area visibility':'Explore nearby communities'}</h3><p className="text-sm text-muted-foreground">Choose a reviewed community. No device GPS, home address, live position or exact distance is collected or displayed here.</p>
 {providerId&&consent&&!consent.revokedAt&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span>Selected: {consent.area.name}, {consent.area.region}{!consent.area.active?' (inactive)':''}</span><Button variant="outline" disabled={busy} onClick={()=>void revoke()}>Withdraw consent</Button></div>}
 <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div><Label>Region</Label><select aria-label="Community region" className="h-10 w-full rounded-md border bg-background px-2" value={region} onChange={e=>{setRegion(e.target.value);setAreaId('');setAreas([]);setItems([]);setSearched(false)}}><option value="">All regions</option>{GHANA_REGIONS.map(r=><option key={r}>{r}</option>)}</select></div><div><Label>Community name</Label><Input aria-label="Community name" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search community"/></div><Button variant="outline" disabled={busy} onClick={()=>void list()}>Find communities</Button></div>
 {searched&&areas.length===0&&<p className="text-sm text-muted-foreground">No reviewed communities found. Try another search.</p>}
 {areas.length>0&&<><Label>Reviewed community</Label><select aria-label="Reviewed community" className="h-10 w-full rounded-md border bg-background px-2" value={areaId} onChange={e=>{setAreaId(e.target.value);setOptIn(false);setItems([])}}><option value="">Select community</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name}, {a.region}</option>)}</select>{providerId&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={optIn} onChange={e=>setOptIn(e.target.checked)}/>Allow my approved profile to appear in approximate community proximity searches.</label>}<Button disabled={busy||!areaId||!!providerId&&(!optIn||!consentLoaded)} onClick={()=>void submit()}>{providerId?'Save service-area consent':'Find nearby service areas'}</Button></>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}
 {!providerId&&items.map(p=><div key={p.id} className="space-y-2 rounded-xl border p-4"><h4 className="font-semibold">{p.displayName}</h4><p className="text-sm">{p.category.toLowerCase().replaceAll('_',' ')} · {p.community}, {p.region}</p><p className="text-sm text-muted-foreground">{p.proximity.toLowerCase().replaceAll('_',' ')} · {p.availability==='AVAILABLE'?'Recently confirmed available':'Availability unconfirmed'}</p><Button variant="outline" onClick={()=>navigate('/services/enquiries?provider='+encodeURIComponent(p.id))}>Request quotation</Button></div>)}
 </CardContent></Card>
}
