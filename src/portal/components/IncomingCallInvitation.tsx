"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {Phone,Video} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {api} from '../api'
import {navigate} from '../router'
import {usePortal} from '../store'
import {callDeadline,callSeconds,callStatusFresh,showIncomingForThread} from '../lib/direct-call-ui-policy'
type Invitation={id:string;conversationId:string;callerId:string;callerName?:string|null;calleeId:string;kind:'VOICE'|'VIDEO';status:string;expiresAt:string}
export default function IncomingCallInvitation({userId,visible,currentThread}:{userId:string;visible:boolean;currentThread?:string}){
 const [enabled,setEnabled]=useState<boolean|null>(null)
 const [call,setCall]=useState<Invitation|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [timing,setTiming]=useState({deadline:0,seen:0})
 const [now,setNow]=useState(Date.now())
 const active=useRef(false),loading=useRef(false),acting=useRef(false)
 const revision=useRef(0)
 const current=useCallback(()=>active.current&&usePortal.getState().user?.id===userId,[userId])
 const load=useCallback(async()=>{
  if(!current()||loading.current||acting.current||document.visibilityState!=='visible')return
  loading.current=true;const rev=++revision.current
  try{
   const response=await api.get<{enabled:boolean;items:Invitation[];serverNow?:string}>('/direct-calls?expectedUserId='+encodeURIComponent(userId))
   if(current()&&rev===revision.current){
    const received=Date.now(),incoming=response.enabled?response.items.find(row=>row.status==='RINGING'&&row.calleeId===userId)??null:null
    setEnabled(response.enabled);setCall(incoming);setNow(received);setTiming({seen:received,deadline:incoming?callDeadline(incoming.expiresAt,response.serverNow,received):0})
   }
  }catch{if(current()&&rev===revision.current)setCall(null)}
  finally{if(rev===revision.current)loading.current=false}
 },[current,userId])
 useEffect(()=>{
  active.current=true;loading.current=false;void load()
  return()=>{active.current=false;loading.current=false;revision.current++}
 },[load])
 useEffect(()=>{
  if(enabled===false)return
  const refresh=()=>void load()
  const timer=window.setInterval(refresh,8000)
  window.addEventListener('ievx:direct-changed',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{window.clearInterval(timer);window.removeEventListener('ievx:direct-changed',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
 },[enabled,load])
 useEffect(()=>{if(!call)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[call?.id])
 const act=async(action:'accept'|'decline')=>{
  if(!call||acting.current||!current()||!callSeconds(timing.deadline,Date.now())||!callStatusFresh(timing.seen,Date.now()))return
  acting.current=true;revision.current++;loading.current=false;setBusy(true);setError('')
  const selected=call
  try{
   const response=await api.post<{call:Invitation}>('/direct-calls',{action,id:selected.id,expectedUserId:userId})
   if(!current())return
   setCall(null)
   if(action==='accept'&&response.call.status==='ACCEPTED')navigate('/messages/'+encodeURIComponent(selected.conversationId))
   else if(action==='accept')setError('This invitation is no longer available.')
  }catch(err){if(current())setError(err instanceof Error?err.message:'Could not respond to invitation.')}
  finally{acting.current=false;if(current()){setBusy(false);void load()}}
 }
 const remaining=callSeconds(timing.deadline,now),fresh=callStatusFresh(timing.seen,now)
 if(!enabled||!call||!showIncomingForThread(visible,currentThread,call.conversationId)||!remaining)return null
 return <Dialog open onOpenChange={()=>{}}><DialogContent className="max-w-md gap-6 rounded-3xl p-6" onEscapeKeyDown={e=>e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()} showCloseButton={false}>
  <DialogHeader><div className="mx-auto mb-2 grid size-14 place-items-center rounded-full bg-primary/10 text-primary">{call.kind==='VIDEO'?<Video className="size-7"/>:<Phone className="size-7"/>}</div><DialogTitle className="text-center text-2xl">{call.callerName||'Incoming contact'}</DialogTitle><DialogDescription className="text-center">Incoming {call.kind.toLowerCase()} invitation · {remaining}s remaining. Invitation test mode; media is not connected.</DialogDescription></DialogHeader>
  {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
  {!fresh&&<p role="status" className="text-center text-sm text-muted-foreground">Reconnecting to confirm invitation…</p>}
  <DialogFooter><Button variant="outline" disabled={busy||!fresh} onClick={()=>void act('decline')}>Decline</Button><Button disabled={busy||!fresh} onClick={()=>void act('accept')}>Accept invitation</Button></DialogFooter>
 </DialogContent></Dialog>
}
