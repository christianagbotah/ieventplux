"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {Phone,Video} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
import {usePortal} from '../store'
import {relative} from '../format'
type Call={id:string;callerId:string;calleeId:string;kind:'VOICE'|'VIDEO';status:string;createdAt:string;expiresAt:string;thisDevice:boolean;mediaConnected:boolean}
type CallResponse={enabled:boolean;mediaAvailable:boolean;items:Call[]}
export default function DirectCallControls({conversationId,userId,canSend}:{conversationId:string;userId:string;canSend:boolean}){
 const [data,setData]=useState<CallResponse|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [history,setHistory]=useState(false)
 const active=useRef(false),inFlight=useRef(false),pending=useRef<{kind:'VOICE'|'VIDEO';key:string}|null>(null)
 const rev=useRef(0)
 const current=useCallback(()=>active.current&&usePortal.getState().user?.id===userId,[userId])
 const load=useCallback(async()=>{
  if(!current()||inFlight.current)return
  const v=++rev.current
  inFlight.current=true
  try{
   const result=await api.get<CallResponse>('/direct-calls?conversationId='+encodeURIComponent(conversationId)+'&expectedUserId='+encodeURIComponent(userId))
   if(current()&&v===rev.current)setData(result)
  }catch{if(current()&&v===rev.current)setError('Could not refresh call invitations.')}
  finally{if(v===rev.current)inFlight.current=false}
 },[conversationId,userId,current])
 useEffect(()=>{
  active.current=true;inFlight.current=false;void load()
  return()=>{active.current=false;rev.current++;inFlight.current=false}
 },[load])
 useEffect(()=>{
  if(!data?.enabled)return
  const refresh=()=>{if(document.visibilityState==='visible')void load()}
  const timer=window.setInterval(refresh,5000)
  window.addEventListener('ievx:direct-changed',refresh);window.addEventListener('focus',refresh)
  return()=>{window.clearInterval(timer);window.removeEventListener('ievx:direct-changed',refresh);window.removeEventListener('focus',refresh)}
 },[data?.enabled,load])
 const action=async(payload:Record<string,unknown>)=>{
  if(busy||!current())return
  setBusy(true);setError('')
  try{
   await api.post('/direct-calls',{...payload,expectedUserId:userId})
   if(current()){pending.current=null;await load()}
  }catch(err){if(current())setError(err instanceof Error?err.message:'Call action unavailable.')}
  finally{if(current())setBusy(false)}
 }
 const start=(kind:'VOICE'|'VIDEO')=>{
  if(!canSend||busy)return
  if(pending.current&&pending.current.kind!==kind){setError('Retry the original invitation type first.');return}
  if(!pending.current)pending.current={kind,key:crypto.randomUUID()}
  void action({action:'start',conversationId,kind,clientKey:pending.current.key})
 }
 if(!data?.enabled)return null
 const call=data.items.find(row=>row.status==='RINGING'||row.status==='ACCEPTED')
 const incoming=call?.calleeId===userId
 return <div className="space-y-2 border-b px-3 py-2">
  <div className="flex flex-wrap items-center gap-2">
   {!call&&canSend&&<><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>start('VOICE')}><Phone className="size-4"/>Voice invite</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>start('VIDEO')}><Video className="size-4"/>Video invite</Button></>}
   <Button type="button" size="sm" variant="ghost" onClick={()=>setHistory(v=>!v)}>{history?'Hide call history':'Call history'}</Button>
  </div>
  {!data.mediaAvailable&&<p className="text-xs text-muted-foreground">Invitation test mode · audio and video connection unavailable.</p>}
  {call&&<div className="space-y-2 rounded-xl border bg-card p-3" role="status">
   <p className="text-sm font-semibold">{call.status==='ACCEPTED'?'Invitation accepted':incoming?'Incoming '+call.kind.toLowerCase()+' invitation':'Calling…'}</p>
   <p className="text-xs text-muted-foreground">{call.status==='ACCEPTED'?'Media is not connected.':incoming?'Accept or decline this invitation.':'Waiting for the recipient.'}</p>
   <div className="flex flex-wrap gap-2">
    {call.status==='RINGING'&&incoming&&<><Button size="sm" disabled={busy||!canSend} onClick={()=>void action({action:'accept',id:call.id})}>Accept</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void action({action:'decline',id:call.id})}>Decline</Button></>}
    {call.status==='RINGING'&&!incoming&&call.thisDevice&&<Button size="sm" variant="destructive" disabled={busy} onClick={()=>void action({action:'cancel',id:call.id})}>Cancel invitation</Button>}
    {call.status==='ACCEPTED'&&call.thisDevice&&<Button size="sm" variant="destructive" disabled={busy} onClick={()=>void action({action:'end',id:call.id})}>End invitation</Button>}
    {call.status==='ACCEPTED'&&!call.thisDevice&&<p className="text-xs">Accepted on another device.</p>}
   </div>
  </div>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  {history&&<div className="max-h-48 space-y-2 overflow-y-auto">{data.items.length===0?<p className="text-xs text-muted-foreground">No call history.</p>:data.items.map(row=><div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 p-2 text-xs"><span>{row.callerId===userId?'Outgoing':'Incoming'} {row.kind.toLowerCase()} · {row.status.toLowerCase()}</span><span className="shrink-0 text-muted-foreground">{relative(row.createdAt)}</span></div>)}</div>}
 </div>
}
