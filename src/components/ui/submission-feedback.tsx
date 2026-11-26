'use client'
import {useEffect,useRef} from 'react'
import {AlertCircle,CheckCircle2} from 'lucide-react'

/** Keep submission errors visible even inside independently scrolling dialogs.
 * Focus without a second scroll, honor reduced motion, and leave feedback in
 * the DOM until the next attempt. Use alongside operation-specific toasts.
 */
export function SubmissionFeedback({message,attempt=0,success=false,bringIntoView=true}:{message:string;attempt?:number;success?:boolean;bringIntoView?:boolean}){
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  if(!message||!bringIntoView||success)return
  const node=ref.current
  if(!node)return
  node.scrollIntoView({block:'center',behavior:'instant'})
  node.focus({preventScroll:true})
 },[message,attempt,success,bringIntoView])
 if(!message)return null
 const Icon=success?CheckCircle2:AlertCircle
 return <div ref={ref} tabIndex={-1} role={success?'status':'alert'} data-submission-feedback
  className={'flex scroll-m-24 items-start gap-2 rounded-xl border p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring '+(success?'border-primary/30 bg-primary/5 text-foreground':'border-destructive/30 bg-destructive/10 text-destructive')}>
  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden/><span className="min-w-0 break-words">{message}</span>
 </div>
}
