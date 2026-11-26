"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {Smartphone,RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {api} from '../api'
import {usePortal} from '../store'
import {relative} from '../format'
type Device={id:string;platform:string;lastUpdatedAt:string;leaseUntil:string|null;currentSession:boolean;registrationCurrent:boolean}
type Result={accountEnabled:boolean;deliveryEnabled:boolean;items:Device[];hasMore:boolean}
export default function PushDeviceManager({userId}:{userId:string}){
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<Device|null>(null)
 const alive=useRef(false),acting=useRef(false),rev=useRef(0)
 const current=useCallback(()=>alive.current&&usePortal.getState().user?.id===userId,[userId])
 const load=useCallback(async()=>{
  const v=++rev.current
  try{const result=await api.get<Result>('/notifications/devices/manage?expectedUserId='+encodeURIComponent(userId));if(current()&&v===rev.current){setData(result);setError('')}}
  catch{if(current()&&v===rev.current){setData(null);setError('Could not load registered phones. Try again.')}}
 },[current,userId])
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;rev.current++}},[load])
 const remove=async()=>{
  if(!target||acting.current||!current())return
  acting.current=true;setBusy(true);setError('')
  try{await api.post('/notifications/devices/manage',{id:target.id,expectedUserId:userId});if(current()){setTarget(null);await load()}}
  catch{if(current())setError('Could not confirm removal. Refresh and retry.')}
  finally{acting.current=false;if(current())setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border border-border/60 p-4">
  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Registered phones</p><p className="text-xs text-muted-foreground">Remove a phone you no longer use. This does not sign it out.</p></div><Button size="icon" variant="ghost" aria-label="Refresh registered phones" disabled={busy} onClick={()=>void load()}><RefreshCw className="size-4"/></Button></div>
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  {!data&&!error&&<p className="text-xs text-muted-foreground">Loading registered phones…</p>}
  {data&&<><p className="text-xs text-muted-foreground">Account alerts {data.accountEnabled?'enabled':'disabled'} · Background delivery {data.deliveryEnabled?'available':'not active'}</p>
   {data.items.length===0?<p className="text-sm text-muted-foreground">No registered phones.</p>:data.items.map(row=><div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/30 p-3"><Smartphone className="size-5 shrink-0 text-muted-foreground"/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{row.platform==='IOS'?'iPhone':'Android phone'}{row.currentSession?' · Current session':''}</p><p className="text-xs text-muted-foreground">{row.registrationCurrent?'Registration current':'Renewal required'} · Updated {relative(row.lastUpdatedAt)}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={()=>setTarget(row)}>Remove</Button></div>)}
   {data.hasMore&&<p className="text-xs text-muted-foreground">Showing the 50 most recently updated phones. Remove unwanted registrations and refresh to see older entries.</p>}
  </>}
  <Dialog open={!!target} onOpenChange={open=>{if(!open&&!busy)setTarget(null)}}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Remove phone notifications?</DialogTitle><DialogDescription>This revokes the selected registration. The phone must explicitly register again to receive alerts. It does not sign the phone out.</DialogDescription></DialogHeader>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setTarget(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={()=>void remove()}>Remove registration</Button></DialogFooter></DialogContent></Dialog>
 </section>
}
