"use client"
import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Play} from 'lucide-react'
export default function ChatVoicePlayer({messageId,userId,mime}:{messageId:string;userId:string;mime:string}){
 const [url,setUrl]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const audioRef=useRef<HTMLAudioElement>(null)
 const current=useRef<{url:string;abort?:AbortController;alive:boolean}>({url:'',alive:true})
 useEffect(()=>{
  const state=current.current
  state.alive=true
  const hidden=()=>{if(document.visibilityState!=='visible')audioRef.current?.pause()}
  document.addEventListener('visibilitychange',hidden)
  return()=>{document.removeEventListener('visibilitychange',hidden);state.alive=false;state.abort?.abort();if(state.url)URL.revokeObjectURL(state.url);state.url=''}
 },[])
 const load=async()=>{
  if(busy)return
  const state=current.current
  const abort=new AbortController();state.abort=abort
  setBusy(true);setError('')
  try{
   const res=await fetch('/api/v1/direct-messages/attachments?messageId='+encodeURIComponent(messageId)+'&expectedUserId='+encodeURIComponent(userId),{credentials:'same-origin',cache:'no-store',signal:abort.signal})
   if(!res.ok||res.headers.get('content-type')!==mime)throw new Error('Voice message unavailable.')
   const blob=await res.blob()
   if(!state.alive)return
   if(blob.size<1||blob.size>2097152)throw new Error('Invalid voice recording.')
   if(state.url)URL.revokeObjectURL(state.url)
   state.url=URL.createObjectURL(blob);setUrl(state.url)
  }catch{if(state.alive)setError('Could not load voice message. Try again.')}
  finally{if(state.alive)setBusy(false)}
 }
 return <div className="mt-2 min-w-0 max-w-full space-y-1">{url?<audio ref={audioRef} className="h-10 w-full max-w-full" controls preload="none" src={url} onError={()=>setError('This browser cannot play this recording format. Use Download instead.')}/>:<Button type="button" size="sm" variant="secondary" disabled={busy} onClick={()=>void load()}><Play className="size-3"/>{busy?'Loading…':'Load voice message'}</Button>}{error&&<p className="text-xs" role="alert">{error}</p>}</div>
}
