'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {useConfirm} from '@/components/ui/confirm-dialog-provider'
import {api} from '../api'
import {purchaseRequestBody,purchaseRequestFingerprint,requestStatusLabel,availableRequestDecisions,decisionLabel,type RequestDecision,type PurchaseRequestRow,type ReviewedBasket,type PurchaseRequestHistory,type PurchaseRequestResponse} from '../lib/marketplace-requests'
const price=(n:number)=>'₵'+(n/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
export function MarketplaceRequests({slug,seller,quote,onSubmitted}:{slug:string;seller:boolean;quote:ReviewedBasket|null;onSubmitted:(submitted:ReviewedBasket)=>void}){
 const confirm=useConfirm()
 const [history,setHistory]=useState<PurchaseRequestHistory|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [submissionError,setSubmissionError]=useState('')
 const [notice,setNotice]=useState('')
 const [submitting,setSubmitting]=useState(false)
 const [decisionBusy,setDecisionBusy]=useState(false)
 const locked=useRef(false)
 const active=useRef(true)
 const epoch=useRef(0)
 const retry=useRef(new Map<string,string>())
 const endpoint='/marketplace/stores/'+encodeURIComponent(slug)+'/requests'
 const load=useCallback(async()=>{
  const generation=++epoch.current
  setLoading(true);setError('')
  try{const result=await api.get<PurchaseRequestHistory>(endpoint)
   if(generation===epoch.current){if(result.seller!==seller)throw new Error('Session changed. Refresh the storefront.');setHistory(result)}
  }catch(e){if(generation===epoch.current){setHistory(null);setError(e instanceof Error?e.message:'Could not load requests.')}}
  finally{if(generation===epoch.current)setLoading(false)}
 },[endpoint,seller])
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;epoch.current++}},[load])
 async function submit(){
  if(!quote||seller||locked.current)return
  locked.current=true;setSubmitting(true);setSubmissionError('');setNotice('')
  try{
   const approved=await confirm({title:'Submit purchase request?',description:'Send this reviewed merchandise selection to the seller. No payment, stock reservation or confirmed order is created.',confirmLabel:'Submit request'})
   if(!approved||!active.current)return
   const fingerprint=purchaseRequestFingerprint(quote)
   if(!retry.current.has(fingerprint))retry.current.set(fingerprint,crypto.randomUUID())
   const result=await api.post<PurchaseRequestResponse>(endpoint,purchaseRequestBody(quote,retry.current.get(fingerprint)!))
   if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('Unexpected purchase request response.')
   if(!active.current)return
   retry.current.delete(fingerprint);setNotice('Purchase request received. Reference: '+result.request.id);onSubmitted(quote);await load()
  }catch(e){if(active.current)setSubmissionError(e instanceof Error?e.message:'Could not submit. Retry with the same reviewed basket.')}
  finally{locked.current=false;if(active.current)setSubmitting(false)}
 }
 async function decide(id:string,status:RequestDecision){
  if(locked.current)return
  locked.current=true;setDecisionBusy(true);setSubmissionError('');setNotice('')
  try{
   const approved=await confirm({title:decisionLabel(status)+'?',description:'This changes the purchase request status only. It does not confirm an order, reserve stock or collect payment.',confirmLabel:decisionLabel(status)})
   if(!approved||!active.current)return
   const result=await api.patch<{request:PurchaseRequestRow;checkoutEnabled:false;inventoryReserved:false}>('/marketplace/requests/'+encodeURIComponent(id),{status})
   if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('Unexpected purchase request response.')
   if(!active.current)return
   setNotice(requestStatusLabel(result.request.status));await load()
  }catch(e){if(active.current){setSubmissionError(e instanceof Error?e.message:'Could not update request.');await load()}}
  finally{locked.current=false;if(active.current)setDecisionBusy(false)}
 }
 return <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Purchase requests">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">{seller?'Incoming purchase requests':'Your purchase requests'}</h2><p className="text-xs text-muted-foreground">Non-binding requests only. No payment or inventory is reserved.</p></div>
   <Button variant="outline" size="sm" disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh requests'}</Button></div>
  {!seller&&quote&&<Button disabled={submitting||decisionBusy} onClick={()=>void submit()}>{submitting?'Submitting…':'Submit purchase request · '+price(quote.totalMinor)}</Button>}
  {!seller&&!quote&&<p className="text-xs text-muted-foreground">Review your basket to submit a new request.</p>}
  {submissionError&&<p role="alert" className="text-sm text-destructive">{submissionError}</p>}
  {notice&&<p role="status" className="break-all text-sm text-primary">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {history&&history.requests.length===0&&<p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No requests yet.</p>}
  {history?.requests.map(row=><article key={row.id} className="space-y-2 rounded-xl border p-4">
   <div className="flex justify-between gap-2"><strong>{price(row.totalMinor)}</strong><span className="text-xs font-semibold">{requestStatusLabel(row.status)}</span></div>
   <p className="break-all text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · {row.id}</p>
   {row.items.map(item=><div key={item.variantId} className="flex justify-between gap-3 text-sm"><span>{item.productName} · {item.variantTitle} × {item.quantity}</span><span className="shrink-0">{price(item.lineMinor)}</span></div>)}
   <div className="flex flex-wrap gap-2">{availableRequestDecisions(seller,row.status).map(action=><Button key={action} size="sm" variant={action==='ACKNOWLEDGED'?'default':'outline'} disabled={decisionBusy||submitting||loading} onClick={()=>void decide(row.id,action)}>{decisionLabel(action)}</Button>)}</div>
  </article>)}
  {history&&history.requests.length===50&&<p className="text-xs text-muted-foreground">Showing the latest 50 requests.</p>}
 </section>
}
