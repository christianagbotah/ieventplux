'use client'
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Textarea} from '@/components/ui/textarea'
import {api} from '../api'
import {SERVICE_CATEGORIES} from '@/server/service-directory-policy'
type Row={id:string;displayName:string;category:string;community:string;serviceDescription:string;reviewStatus:string;owner:{displayName:string;emailVerifiedAt:string|null;status:string}}
export function ServiceProviderReviews(){
 const [items,setItems]=useState<Row[]>([]),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[attested,setAttested]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const load=useCallback(async()=>{try{setItems((await api.get<{items:Row[]}>('/admin/service-providers')).items)}catch(e){setMessage(e instanceof Error?e.message:'Review queue unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 async function decide(id:string,decision:string){
  setBusy(true);setMessage('')
  try{await api.patch('/admin/service-providers/'+encodeURIComponent(id),{decision,reason,attested});setSelected('');setReason('');setAttested(false);await load();setMessage('Review recorded. Owner must explicitly publish an approved profile.')}catch(e){setMessage(e instanceof Error?e.message:'Review failed.')}finally{setBusy(false)}
 }
 return <div className="space-y-4"><h2 className="text-xl font-bold">Service provider review</h2><p className="text-sm text-muted-foreground">Confirm your password in Profile → Security before reviewing. Independent review is mandatory. Regulated services cannot be approved in this pilot. Do not enter personal credential numbers or documents in reasons.</p>{message&&<p role="status" className="rounded-lg border p-3">{message}</p>}{items.length===0&&<p className="text-sm text-muted-foreground">No pending or approved profiles.</p>}
 {items.map(p=>{const regulated=SERVICE_CATEGORIES.find(c=>c.id===p.category)?.regulated!==false;return <Card key={p.id} className="rounded-xl"><CardContent className="space-y-3 p-4"><h3 className="font-bold">{p.displayName}</h3><p className="text-sm">{p.category} · {p.community} · {p.reviewStatus}</p><p className="text-sm">{p.serviceDescription}</p><p className="text-xs text-muted-foreground">Owner: {p.owner.displayName} · {p.owner.status} · {p.owner.emailVerifiedAt?'Email verified':'Email unverified'}{regulated?' · Credential certification pending':''}</p>{selected!==p.id?<Button variant="outline" onClick={()=>{setSelected(p.id);setReason('');setAttested(false)}}>Review</Button>:<><Textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder="Document review decision (at least 10 characters)"/><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>I have independently reviewed the information and confirm this decision.</label><div className="flex flex-wrap gap-2">{p.reviewStatus==='PENDING'&&!regulated&&<Button disabled={busy||!attested||reason.trim().length<10} onClick={()=>void decide(p.id,'APPROVE')}>Approve pilot profile</Button>}{p.reviewStatus==='PENDING'&&<Button variant="outline" disabled={busy||!attested||reason.trim().length<10} onClick={()=>void decide(p.id,'REJECT')}>Reject</Button>}{p.reviewStatus==='APPROVED'&&<Button variant="destructive" disabled={busy||!attested||reason.trim().length<10} onClick={()=>void decide(p.id,'SUSPEND')}>Suspend</Button>}<Button variant="outline" onClick={()=>setSelected('')}>Cancel</Button></div></>}</CardContent></Card>})}</div>
}
