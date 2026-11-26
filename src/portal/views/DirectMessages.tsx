"use client"

import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowLeft,Check,CheckCheck,MessageCircle,Search,Send,UserPlus} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {Flag} from 'lucide-react'
import {api} from '../api'
import {navigate} from '../router'
import {usePortal} from '../store'
import {initials,relative} from '../format'

type Contact={id:string;displayName:string;avatarUrl:string|null}
type Conversation={id:string;status:string;requesterId:string;updatedAt?:string;peer:Contact|null;unread?:number;canSend?:boolean}
type Message={id:string;senderId:string;body:string;createdAt:string;readAt:string|null;removedAt?:string|null}
type Detail={conversation:Conversation;items:Message[];nextCursor:string|null}
function Avatar({contact}:{contact:Contact|null}){
 return <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(contact?.displayName??'Member')}</span>
}
export default function DirectMessages({id}:{id?:string}){
 const {user,booted}=usePortal()
 useEffect(()=>{if(booted&&!user)navigate('/signin')},[booted,user])
 if(!user)return null
 return <Inbox key={user.id+':'+(id??'inbox')} userId={user.id} id={id}/>
}
function Inbox({userId,id}:{userId:string;id?:string}){
 const [conversations,setConversations]=useState<Conversation[]|null>(null)
 const [contacts,setContacts]=useState<Contact[]|null>(null)
 const [query,setQuery]=useState('')
 const [detail,setDetail]=useState<Detail|null>(null)
 const [older,setOlder]=useState<Message[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [draft,setDraft]=useState('')
 const [reportTarget,setReportTarget]=useState<string|null>(null)
 const [reportReason,setReportReason]=useState('SPAM')
 const [reportDetails,setReportDetails]=useState('')
 const [reportStatus,setReportStatus]=useState('')
 const [reported,setReported]=useState<string[]>([])
 const [shareActivity,setShareActivity]=useState(false)
 const [peerActivity,setPeerActivity]=useState({active:false,typing:false})
 const lastTyping=useRef(0)
 const heartbeatRevision=useRef(0)
 const canShare=detail?.conversation.canSend===true
 useEffect(()=>{
  if(!id||!canShare)return
  let alive=true
  let inFlight=false
  const tick=async()=>{
   if(!alive||inFlight||document.visibilityState!=='visible'||!document.hasFocus())return
   if(usePortal.getState().user?.id!==userId)return
   inFlight=true
   const rev=++heartbeatRevision.current
   try{
    const result=await api.post<{active:boolean;typing:boolean}>('/direct-messages',{action:'activity',id,expectedUserId:userId,share:shareActivity,typing:shareActivity&&Date.now()-lastTyping.current<6000})
    if(alive&&rev===heartbeatRevision.current&&usePortal.getState().user?.id===userId)setPeerActivity(result)
   }catch{if(alive&&rev===heartbeatRevision.current)setPeerActivity({active:false,typing:false})}
   finally{inFlight=false}
  }
  void tick()
  const timer=window.setInterval(()=>void tick(),4000)
  const resume=()=>void tick()
  document.addEventListener('visibilitychange',resume)
  window.addEventListener('focus',resume)
  return()=>{alive=false;heartbeatRevision.current++;window.clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume)}
 },[id,canShare,shareActivity,userId])

 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [page,setPage]=useState(1)
 const [hasMore,setHasMore]=useState(false)
 const active=useRef(true)
 const version=useRef(0)
 const pending=useRef<{body:string;key:string}|null>(null)
 const lastRead=useRef('')
 const historyStarted=useRef(false)
 const scrollEnd=useRef<HTMLDivElement>(null)
 const current=useCallback(()=>active.current&&usePortal.getState().user?.id===userId,[userId])
 const load=useCallback(async()=>{
  const v=++version.current
  try{
   const list=await api.get<{items:Conversation[];hasMore:boolean}>('/direct-messages?page='+page)
   if(!current()||v!==version.current)return
   setConversations(list.items);setHasMore(list.hasMore)
   if(id){
    const data=await api.get<Detail>('/direct-messages?id='+encodeURIComponent(id))
    if(!current()||v!==version.current)return
    setDetail(data);if(!historyStarted.current)setCursor(data.nextCursor)
    const unread=data.items.find(m=>m.senderId!==userId&&!m.readAt)
    if(unread&&lastRead.current!==unread.id&&document.visibilityState==='visible'&&document.hasFocus()){
     lastRead.current=unread.id
     void api.post('/direct-messages',{action:'read',id,throughId:unread.id,expectedUserId:userId}).catch(()=>{lastRead.current=''})
    }
   }
  }catch(err){if(current()&&v===version.current)setError(err instanceof Error?err.message:'Could not load messages.')}
 },[current,id,page,userId])
 useEffect(()=>{
  active.current=true
  const refresh=()=>{if(document.visibilityState==='visible')void load()}
  refresh()
  window.addEventListener('ievx:direct-changed',refresh)
  window.addEventListener('focus',refresh)
  document.addEventListener('visibilitychange',refresh)
  const timer=window.setInterval(refresh,5000)
  return()=>{active.current=false;version.current++;window.clearInterval(timer);window.removeEventListener('ievx:direct-changed',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
 },[load])
 const search=async()=>{
  setBusy(true);setError('')
  try{const result=await api.get<{items:Contact[]}>('/direct-messages?contacts=1&q='+encodeURIComponent(query));if(current())setContacts(result.items)}
  catch(err){if(current())setError(err instanceof Error?err.message:'Could not load contacts.')}
  finally{if(current())setBusy(false)}
 }
 const mutate=async(payload:Record<string,unknown>)=>{
  if(!current()||busy)return
  setBusy(true);setError('')
  try{
   const result=await api.post<{conversation?:Conversation}>('/direct-messages',{...payload,expectedUserId:userId})
   if(!current())return
   if(payload.action==='request'&&result.conversation)navigate('/messages/'+result.conversation.id)
   if(payload.action==='send'){pending.current=null;lastTyping.current=0;setDraft('')}
   await load()
  }catch(err){if(current())setError(err instanceof Error?err.message:'Could not complete action.')}
  finally{if(current())setBusy(false)}
 }
 const submitReport=async()=>{
  if(!reportTarget||busy||!current())return
  setBusy(true);setError('')
  try{
   await api.post('/direct-messages',{action:'report',id,messageId:reportTarget,reason:reportReason,details:reportDetails,expectedUserId:userId})
   if(current()){setReported(v=>[...v,reportTarget]);setReportStatus('Report submitted to moderation.');setReportTarget(null)}
  }catch(err){if(current())setError(err instanceof Error?err.message:'Could not submit report.')}
  finally{if(current())setBusy(false)}
 }
 const send=()=>{
  const body=draft.trim()
  if(!body||busy)return
  if(pending.current&&pending.current.body!==body){
   setError('The previous message has an uncertain result. Retry the original text first.');return
  }
  if(!pending.current)pending.current={body,key:crypto.randomUUID()}
  void mutate({action:'send',id,...{body:pending.current.body,clientKey:pending.current.key}})
 }
 const more=async()=>{
  if(!id||!cursor||busy)return
  setBusy(true);setError('')
  try{
   const data=await api.get<Detail>('/direct-messages?id='+encodeURIComponent(id)+'&before='+encodeURIComponent(cursor))
   if(current()){historyStarted.current=true;setOlder(v=>[...v,...data.items]);setCursor(data.nextCursor)}
  }catch(err){if(current())setError(err instanceof Error?err.message:'Could not load older messages.')}
  finally{if(current())setBusy(false)}
 }
 const items=Array.from(new Map([...older,...(detail?.items??[])].map(m=>[m.id,m])).values()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))
 const latest=detail?.items[0]?.id
 useEffect(()=>{if(latest)scrollEnd.current?.scrollIntoView({block:'nearest'})},[latest])
 const c=detail?.conversation
 return <section className="mx-auto w-full max-w-6xl px-2 py-4 sm:px-0 sm:py-6">
  <header className="mb-4 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Messages</h1><p className="text-sm text-muted-foreground">Private conversations</p></div><Button variant="outline" size="sm" onClick={()=>navigate('/me?tab=notifications')}>Activity</Button></header>
  {reportStatus&&<p role="status" className="mb-3 rounded-xl border bg-card p-3 text-sm">{reportStatus}</p>}
  {error&&<div role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error} <button className="underline" onClick={()=>{setError('');void load()}}>Refresh</button></div>}
  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(235px,1fr)_minmax(0,2fr)]">
   <aside className={`min-w-0 rounded-2xl border bg-card p-3 ${id?'hidden md:block':''}`}>
    <div className="mb-3 flex gap-2"><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a connection" aria-label="Find a connection" onKeyDown={e=>{if(e.key==='Enter')void search()}}/><Button variant="outline" size="icon" aria-label="Search connections" disabled={busy} onClick={()=>void search()}><Search className="size-4"/></Button></div>
    {contacts&&<div className="mb-4 border-b pb-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Your connections</p>{contacts.length===0?<p className="text-sm text-muted-foreground">No matching connections.</p>:contacts.map(p=><button key={p.id} disabled={busy} onClick={()=>void mutate({action:'request',userId:p.id})} className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-muted"><Avatar contact={p}/><span className="min-w-0 flex-1 truncate text-sm font-medium">{p.displayName}</span><UserPlus className="size-4 shrink-0"/></button>)}</div>}
    <p className="mb-2 text-xs font-semibold text-muted-foreground">Conversations</p>
    {!conversations?<p className="p-3 text-sm text-muted-foreground">Loading…</p>:conversations.length===0?<p className="p-3 text-sm text-muted-foreground">No conversations yet. Find a connection to start.</p>:conversations.map(row=><button key={row.id} onClick={()=>navigate('/messages/'+row.id)} className={`flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-muted ${id===row.id?'bg-primary/10':''}`}><Avatar contact={row.peer}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.peer?.displayName??'Member'}</span><span className="block text-xs text-muted-foreground">{row.status==='PENDING'?'Message request':row.status==='DECLINED'?'Request declined':row.updatedAt?relative(row.updatedAt):'Conversation'}</span></span>{!!row.unread&&<span className="rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">{row.unread}</span>}</button>)}
    {(page>1||hasMore)&&<div className="mt-3 flex justify-between"><Button size="sm" variant="ghost" disabled={page===1} onClick={()=>setPage(v=>v-1)}>Previous</Button><Button size="sm" variant="ghost" disabled={!hasMore} onClick={()=>setPage(v=>v+1)}>Next</Button></div>}
   </aside>
   <div className={`min-w-0 overflow-hidden rounded-2xl border bg-card ${id?'':'hidden md:block'}`}>
    {!id?<div className="grid min-h-80 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto mb-3 size-10 text-primary"/><p className="font-semibold">Choose a conversation</p><p className="text-sm text-muted-foreground">Your messages appear here.</p></div></div>:!c?<p className="p-5 text-sm text-muted-foreground">Loading conversation…</p>:<>
     <header className="flex items-center gap-3 border-b p-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Back to conversations" onClick={()=>navigate('/messages')}><ArrowLeft className="size-5"/></Button><Avatar contact={c.peer}/><div className="min-w-0"><p className="truncate font-semibold">{c.peer?.displayName??'Member'}</p><p className="text-xs text-muted-foreground">{c.status==='ACCEPTED'?(c.canSend&&peerActivity.typing?'Typing…':c.canSend&&peerActivity.active?'Active in this chat':'Private conversation'):c.status==='PENDING'?'Message request':'Request declined'}</p></div></header>
     {c.canSend&&<div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground"><label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={shareActivity} onChange={e=>{setShareActivity(e.target.checked);lastTyping.current=0}}/> Share chat activity</label><span aria-live="polite">{peerActivity.typing?'Typing…':''}</span></div>}
     {c.status==='PENDING'?<div className="space-y-3 p-5 text-sm">{c.requesterId===userId?<p>Waiting for this person to accept your request.</p>:<><p>Accept this request to start a conversation.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void mutate({action:'accept',id})}>Accept</Button><Button variant="outline" disabled={busy} onClick={()=>void mutate({action:'decline',id})}>Decline</Button></div></>}</div>:c.status==='DECLINED'?<p className="p-5 text-sm text-muted-foreground">This message request was declined.</p>:<>
     <div className="flex h-[min(54vh,500px)] min-h-52 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
      {cursor&&<Button variant="ghost" size="sm" className="self-center" disabled={busy} onClick={()=>void more()}>Load older messages</Button>}
      {items.length===0&&<p className="py-6 text-center text-sm text-muted-foreground">Start the conversation.</p>}
      {items.map(m=><div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.senderId===userId?'self-end bg-primary text-primary-foreground':'self-start border bg-card'}`}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.removedAt?'Message removed by moderation':m.body}</p>{m.senderId!==userId&&!m.removedAt&&<button type="button" className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground" disabled={reported.includes(m.id)||busy} onClick={()=>{setReportTarget(m.id);setReportReason('SPAM');setReportDetails('');setError('')}}><Flag className="size-3"/>{reported.includes(m.id)?'Reported':'Report'}</button>}<span className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">{relative(m.createdAt)}{m.senderId===userId&&(m.readAt?<CheckCheck className="size-3" aria-label="Read"/>:<Check className="size-3" aria-label="Sent"/>)}</span></div>)}
      <div ref={scrollEnd}/>
     </div>
     {c.canSend?<form className="flex items-end gap-2 border-t p-3" onSubmit={e=>{e.preventDefault();send()}}><Textarea value={draft} onChange={e=>{setDraft(e.target.value);lastTyping.current=e.target.value.trim()?Date.now():0}} maxLength={4000} rows={2} placeholder="Write a message…" aria-label="Message" className="min-h-11 resize-none"/><Button size="icon" className="size-11 shrink-0 rounded-xl" aria-label="Send message" disabled={busy||!draft.trim()}><Send className="size-4"/></Button></form>:<p className="border-t p-3 text-sm text-muted-foreground">Sending is unavailable for this contact.</p>}
     </>}
    </>}
   </div>
  </div>
  <Dialog open={!!reportTarget} onOpenChange={open=>{if(!open&&!busy)setReportTarget(null)}}>
   <DialogContent className="max-w-sm">
    <DialogHeader><DialogTitle>Report message</DialogTitle><DialogDescription>Only the selected message will be available to authorized moderators.</DialogDescription></DialogHeader>
    <label className="space-y-1 text-sm">Reason<select aria-label="Report reason" className="block min-h-11 w-full rounded-lg border bg-background px-3" value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="SPAM">Spam</option><option value="OFFENSIVE">Harassment or offensive content</option><option value="FRAUD">Fraud or scam</option><option value="OTHER">Other</option></select></label>
    <Textarea aria-label="Report details" placeholder="Optional details" maxLength={1000} value={reportDetails} onChange={e=>setReportDetails(e.target.value)}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setReportTarget(null)}>Cancel</Button><Button disabled={busy} onClick={()=>void submitReport()}>{busy?'Submitting…':'Submit report'}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </section>
}
