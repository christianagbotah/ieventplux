"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {Phone,Video} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
import {usePortal} from '../store'
import {relative} from '../format'
import {callDeadline,callSeconds,callStatusFresh} from '../lib/direct-call-ui-policy'
type Call={id:string;callerId:string;calleeId:string;kind:'VOICE'|'VIDEO';status:string;createdAt:string;expiresAt:string;thisDevice:boolean;mediaConnected:boolean}
type CallResponse={enabled:boolean;mediaAvailable:boolean;items:Call[];serverNow?:string}
export default function DirectCallControls({conversationId,userId,canSend}:{conversationId:string;userId:string;canSend:boolean}){
 const [data,setData]=useState<CallResponse|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [history,setHistory]=useState(false)
 const [seen,setSeen]=useState(0),[now,setNow]=useState(Date.now())
 const acting=useRef(false)
 const active=useRef(false),inFlight=useRef(false),pending=useRef<{kind:'VOICE'|'VIDEO';key:string}|null>(null)
 const rev=useRef(0)
 const current=useCallback(()=>active.current&&usePortal.getState().user?.id===userId,[userId])
 const load=useCallback(async()=>{
  if(!current()||inFlight.current||acting.current)return
  const v=++rev.current
  inFlight.current=true
  try{
   const result=await api.get<CallResponse>('/direct-calls?conversationId='+encodeURIComponent(conversationId)+'&expectedUserId='+encodeURIComponent(userId))
   if(current()&&v===rev.current){setData(result);const at=Date.now();setSeen(at);setNow(at);setError('')}
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
 useEffect(()=>{if(!data?.enabled)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[data?.enabled])
 const action=async(payload:Record<string,unknown>)=>{
  if(acting.current||!current()||!callStatusFresh(seen,Date.now()))return
  acting.current=true;rev.current++;inFlight.current=false;setBusy(true);setError('')
  try{
   const result=await api.post<{call:Call}>('/direct-calls',{...payload,expectedUserId:userId})
   if(current()){pending.current=null;setData(old=>old?{...old,items:[result.call,...old.items.filter(item=>item.id!==result.call.id)]}:old);setSeen(0)}
  }catch(err){if(current())setError(err instanceof Error?err.message:'Call action unavailable.')}
  finally{acting.current=false;if(current()){setBusy(false);void load()}}
 }
 const start=(kind:'VOICE'|'VIDEO')=>{
  if(!canSend||acting.current||!callStatusFresh(seen,Date.now()))return
  if(pending.current&&pending.current.kind!==kind){setError('Retry the original invitation type first.');return}
  if(!pending.current)pending.current={kind,key:crypto.randomUUID()}
  void action({action:'start',conversationId,kind,clientKey:pending.current.key})
 }
 if(!data?.enabled)return null
 const call=data.items.find(row=>row.status==='RINGING'||row.status==='ACCEPTED')
 const incoming=call?.calleeId===userId
 const remaining=call?callSeconds(callDeadline(call.expiresAt,data.serverNow,seen),now):0
 const fresh=callStatusFresh(seen,now),locked=busy||!fresh
 return <div className="space-y-2 border-b px-3 py-2">
  <div className="flex flex-wrap items-center gap-2">
   {!call&&canSend&&<><Button type="button" size="sm" variant="outline" disabled={locked} onClick={()=>start('VOICE')}><Phone className="size-4"/>Voice invite</Button><Button type="button" size="sm" variant="outline" disabled={locked} onClick={()=>start('VIDEO')}><Video className="size-4"/>Video invite</Button></>}
   <Button type="button" size="sm" variant="ghost" onClick={()=>setHistory(v=>!v)}>{history?'Hide call history':'Call history'}</Button>
  </div>
  {!data.mediaAvailable&&<p className="text-xs text-muted-foreground">Invitation test mode · audio and video connection unavailable.</p>}
  {!fresh&&<p role="status" className="text-xs text-muted-foreground">Checking current call status…</p>}
  {call&&<div className="space-y-2 rounded-xl border bg-card p-3" role="status">
   <p className="text-sm font-semibold">{call.status==='ACCEPTED'?'Invitation accepted':incoming?'Incoming '+call.kind.toLowerCase()+' invitation':'Calling…'}</p>
   <p className="text-xs text-muted-foreground">{call.status==='ACCEPTED'?'Media is not connected.':incoming?'Accept or decline this invitation.':'Waiting for the recipient.'}</p>
   <p className="text-xs tabular-nums text-muted-foreground">{fresh&&remaining>0?remaining+'s remaining':'Awaiting server confirmation'}</p>
   <div className="flex flex-wrap gap-2">
    {call.status==='RINGING'&&incoming&&<><Button size="sm" disabled={locked||!remaining||!canSend} onClick={()=>void action({action:'accept',id:call.id})}>Accept</Button><Button size="sm" variant="outline" disabled={locked||!remaining} onClick={()=>void action({action:'decline',id:call.id})}>Decline</Button></>}
    {call.status==='RINGING'&&!incoming&&call.thisDevice&&<Button size="sm" variant="destructive" disabled={locked||!remaining} onClick={()=>void action({action:'cancel',id:call.id})}>Cancel invitation</Button>}
    {call.status==='ACCEPTED'&&call.thisDevice&&<Button size="sm" variant="destructive" disabled={locked||!remaining} onClick={()=>void action({action:'end',id:call.id})}>End invitation</Button>}
    {call.status==='ACCEPTED'&&!call.thisDevice&&<p className="text-xs">Accepted on another device.</p>}
   </div>
  </div>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  {history&&<div className="max-h-48 space-y-2 overflow-y-auto">{data.items.length===0?<p className="text-xs text-muted-foreground">No call history.</p>:data.items.map(row=><div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 p-2 text-xs"><span>{row.callerId===userId?'Outgoing':'Incoming'} {row.kind.toLowerCase()} · {row.status.toLowerCase()}</span><span className="shrink-0 text-muted-foreground">{relative(row.createdAt)}</span></div>)}</div>}
 </div>
}
