'use client'
import {useCallback,useEffect,useState} from 'react'
import {ShieldCheck} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {api} from '../api'
import {DOCUMENT_KINDS,parseDocumentKind} from '@/server/provider-credential-intake-policy'
type Document={id:string;kind:string;reviewStatus:string;uploadedAt:string;size:number}
const label=(value:string)=>value.toLowerCase().replaceAll('_',' ')
export function ProviderCredentialPanel({providerId,category}:{providerId:string;category:string}){
 const base='/service-providers/'+encodeURIComponent(providerId)+'/credentials'
 const [items,setItems]=useState<Document[]>([]),[enabled,setEnabled]=useState(false),[loaded,setLoaded]=useState(false),[kind,setKind]=useState(''),[file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[reset,setReset]=useState(0),[withdraw,setWithdraw]=useState('')
 const load=useCallback(async()=>{try{const r=await api.get<{items:Document[];intakeEnabled:boolean}>(base);setItems(r.items);setEnabled(r.intakeEnabled);setLoaded(true)}catch(e){setLoaded(false);setNotice(e instanceof Error?e.message:'Credential records unavailable.')}},[base])
 useEffect(()=>{void load()},[load])
 const applicable=DOCUMENT_KINDS.filter(k=>{try{parseDocumentKind(category,k,'yes');return true}catch{return false}})
 async function upload(){
  if(!file||!consent||!enabled)return
  setBusy(true);setNotice('')
  try{const form=new FormData();form.append('file',file);form.append('kind',kind);form.append('consent','yes');await api.upload(base,form);setKind('');setFile(null);setConsent(false);setReset(v=>v+1);await load();setNotice('Document stored privately for screening. This does not certify or activate your profile.')}catch(e){setNotice(e instanceof Error?e.message:'Upload failed.')}finally{setBusy(false)}
 }
 async function remove(id:string){
  setBusy(true);setNotice('')
  try{await api.delete(base+'/'+encodeURIComponent(id));setWithdraw('');await load();setNotice('Document withdrawn from active records. Protected backup retention may still apply.')}catch(e){setNotice(e instanceof Error?e.message:'Withdrawal failed.')}finally{setBusy(false)}
 }
 return <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary"/> Private credential documents</h3><p className="text-sm text-muted-foreground">Screening is not licence validation or certification. Regulated service publication remains disabled.</p>{loaded&&!enabled&&<p className="rounded-xl border p-3 text-sm">Document intake is not yet enabled. Do not submit identity or licence documents through ordinary listings or messages.</p>}
 {loaded&&enabled&&<div className="space-y-3"><label className="block text-sm font-medium">Evidence family<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Choose document type</option>{applicable.map(k=><option key={k} value={k}>{label(k)}</option>)}</select></label><label className="block text-sm font-medium">Clear document image (up to 8 MB)<input key={reset} type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to private storage and authorized screening of this document.</label><Button disabled={busy||!kind||!file||file.size>8388608||!consent} onClick={()=>void upload()}>Submit privately</Button></div>}
 {items.map(d=><div key={d.id} className="space-y-2 rounded-xl border p-3"><p className="font-medium">{label(d.kind)}</p><p className="text-sm text-muted-foreground">{label(d.reviewStatus)} · {new Date(d.uploadedAt).toLocaleDateString()}</p><div className="flex flex-wrap gap-2"><a className="text-sm font-medium underline" href={'/api/v1'+base+'/'+encodeURIComponent(d.id)} target="_blank" rel="noopener noreferrer">View private image</a>{d.reviewStatus==='PENDING'&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>setWithdraw(d.id)}>Withdraw</Button>}</div>{withdraw===d.id&&<div className="space-y-2"><p className="text-sm">Remove this document from active verification records?</p><Button variant="destructive" size="sm" disabled={busy} onClick={()=>void remove(d.id)}>Confirm withdrawal</Button><Button variant="outline" size="sm" onClick={()=>setWithdraw('')}>Keep document</Button></div>}</div>)}
 {loaded&&!items.length&&<p className="text-sm text-muted-foreground">No documents submitted.</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
 </CardContent></Card>
}
