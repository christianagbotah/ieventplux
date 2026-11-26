"use client"
import {useEffect,useRef,useState} from 'react'
import {Mic,Square,X} from 'lucide-react'
import {Button} from '@/components/ui/button'

const MAX_BYTES=2*1024*1024,MAX_SECONDS=60
type Capture={stream:MediaStream;recorder:MediaRecorder;chunks:Blob[];bytes:number;cancelled:boolean;timer:number}
export default function ChatVoiceRecorder({disabled,onFile,onError}:{disabled:boolean;onFile:(file:File)=>void;onError:(message:string)=>void}){
 const [phase,setPhase]=useState<'idle'|'permission'|'recording'>('idle')
 const [elapsed,setElapsed]=useState(0)
 const capture=useRef<Capture|null>(null)
 const generation=useRef(0)
 const cancel=()=>{
  generation.current++
  const c=capture.current
  capture.current=null
  if(c){c.cancelled=true;window.clearInterval(c.timer);if(c.recorder.state!=='inactive')c.recorder.stop();c.stream.getTracks().forEach(t=>t.stop())}
  setPhase('idle');setElapsed(0)
 }
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState!=='visible')cancel()}
  document.addEventListener('visibilitychange',hidden)
  return()=>{generation.current++;const c=capture.current;capture.current=null;if(c){c.cancelled=true;window.clearInterval(c.timer);if(c.recorder.state!=='inactive')c.recorder.stop();c.stream.getTracks().forEach(t=>t.stop())}document.removeEventListener('visibilitychange',hidden)}
 },[])
 const start=async()=>{
  if(disabled||phase!=='idle')return
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){onError('Voice recording is unavailable in this browser. Use a supported secure browser.');return}
  const mime=['audio/webm;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type))
  if(!mime){onError('This browser does not support a compatible voice recording format.');return}
  const rev=++generation.current
  setPhase('permission');setElapsed(0)
  let stream:MediaStream|undefined
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false})
   if(rev!==generation.current||document.visibilityState!=='visible'){stream.getTracks().forEach(t=>t.stop());return}
   const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000})
   const c:Capture={stream,recorder,chunks:[],bytes:0,cancelled:false,timer:0}
   capture.current=c
   const stop=()=>{if(recorder.state!=='inactive')recorder.stop()}
   recorder.ondataavailable=e=>{
    if(c.cancelled||!e.data.size)return
    c.bytes+=e.data.size
    if(c.bytes>MAX_BYTES){c.cancelled=true;stop();onError('Recording exceeded the file size limit.');return}
    c.chunks.push(e.data)
   }
   recorder.onerror=()=>{c.cancelled=true;stop();onError('Voice recording failed.')}
   recorder.onstop=()=>{
    window.clearInterval(c.timer);c.stream.getTracks().forEach(t=>t.stop())
    if(capture.current===c)capture.current=null
    if(rev!==generation.current)return
    setPhase('idle');setElapsed(0)
    if(c.cancelled)return
    const type=mime.startsWith('audio/mp4')?'audio/mp4':'audio/webm'
    const blob=new Blob(c.chunks,{type})
    if(!blob.size||blob.size>MAX_BYTES){onError('No usable voice recording was captured.');return}
    onFile(new File([blob],'Voice message'+(type==='audio/mp4'?'.m4a':'.webm'),{type}))
   }
   recorder.start(250)
   const started=Date.now()
   c.timer=window.setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);setElapsed(Math.min(seconds,MAX_SECONDS));if(seconds>=MAX_SECONDS)stop()},250)
   setPhase('recording')
  }catch{
   stream?.getTracks().forEach(t=>t.stop())
   if(rev===generation.current){setPhase('idle');onError('Microphone access failed. Check your browser permissions and try again.')}
  }
 }
 if(phase==='recording')return <div className="flex flex-wrap items-center gap-2" role="status"><span className="text-xs font-semibold text-destructive">Recording {elapsed}s / 60s</span><Button type="button" size="sm" variant="outline" onClick={()=>capture.current?.recorder.stop()}><Square className="size-3"/> Finish</Button><Button type="button" size="icon" variant="ghost" aria-label="Cancel recording" onClick={cancel}><X className="size-4"/></Button></div>
 if(phase==='permission')return <Button type="button" size="sm" variant="outline" onClick={cancel}>Cancel microphone request</Button>
 return <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Record voice message" disabled={disabled} onClick={()=>void start()}><Mic className="size-4"/></Button>
}
