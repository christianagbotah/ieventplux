'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {SubmissionFeedback} from '@/components/ui/submission-feedback'
import {useToast} from '@/hooks/use-toast'
import {Button} from '@/components/ui/button'
import {useConfirm} from '@/components/ui/confirm-dialog-provider'
import {api} from '../api'
import {stockHoldLabel,inventoryHoldFingerprint,canPrepareCheckout,purchaseRequestBody,purchaseRequestFingerprint,requestStatusLabel,availableRequestDecisions,decisionLabel,type RequestDecision,type PurchaseRequestRow,type ReviewedBasket,type PurchaseRequestHistory,type PurchaseRequestResponse} from '../lib/marketplace-requests'
const price=(n:number)=>'₵'+(n/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
export function MarketplaceRequests({slug,seller,quote,onSubmitted,onInventoryChanged}:{slug:string;seller:boolean;quote:ReviewedBasket|null;onSubmitted:(submitted:ReviewedBasket)=>void;onInventoryChanged:()=>void}){
 const confirm=useConfirm()
 const {toast}=useToast()
 const [attempt,setAttempt]=useState(0)
 function fail(e:unknown,fallback:string){const message=e instanceof Error?e.message:fallback;setSubmissionError(message);setAttempt(n=>n+1);toast({title:'Request not completed',description:message,variant:'destructive',duration:10000})}
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
 const inFlight=useRef(false)
 const lastInventory=useRef<string|null>(null)
 const [now,setNow]=useState(Date.now())
 const retry=useRef(new Map<string,string>())
 const endpoint='/marketplace/stores/'+encodeURIComponent(slug)+'/requests'
 const load=useCallback(async(background=false)=>{
  if(!active.current||(background&&(locked.current||inFlight.current)))return
  inFlight.current=true;setNow(Date.now())
  const generation=++epoch.current
  if(!background)setLoading(true);setError('')
  try{const result=await api.get<PurchaseRequestHistory>(endpoint)
   if(active.current&&generation===epoch.current){if(result.seller!==seller)throw new Error('Session changed. Refresh the storefront.');const signature=inventoryHoldFingerprint(result);const changed=lastInventory.current!==null&&lastInventory.current!==signature;lastInventory.current=signature;setHistory(result);if(changed)onInventoryChanged()}
  }catch(e){if(generation===epoch.current){setHistory(null);setError(e instanceof Error?e.message:'Could not load requests.')}}
  finally{if(generation===epoch.current){inFlight.current=false;setLoading(false)}}
 },[endpoint,seller,onInventoryChanged])
 useEffect(()=>{active.current=true;lastInventory.current=null;void load();return()=>{active.current=false;epoch.current++;inFlight.current=false}},[load])
 useEffect(()=>{const wake=()=>{if(document.visibilityState==='visible'){setNow(Date.now());void load(true)}};const timer=window.setInterval(wake,15000);document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('ievx:marketplace-changed',wake);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('ievx:marketplace-changed',wake)}},[load])
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
   retry.current.delete(fingerprint);setNotice('Purchase request received. Reference: '+result.request.id);toast({title:'Purchase request submitted'});onSubmitted(quote);await load()
  }catch(e){if(active.current)fail(e,'Could not submit. Retry with the same reviewed basket.')}
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
   setNotice(requestStatusLabel(result.request.status));toast({title:'Request '+requestStatusLabel(result.request.status).toLowerCase()});await load()
  }catch(e){if(active.current){fail(e,'Could not update request.');await load()}}
  finally{locked.current=false;if(active.current)setDecisionBusy(false)}
 }
 async function hold(id:string,release:boolean){
  if(locked.current)return
  locked.current=true;setDecisionBusy(true);setSubmissionError('');setNotice('')
  try{
   const approved=await confirm({title:release?'Release stock hold?':'Hold requested stock?',description:release?'The held quantities become available for other buyers.':'Reserve the reviewed quantities for 30 minutes. No payment or confirmed order is created.',confirmLabel:release?'Release hold':'Hold stock'})
   if(!approved||!active.current)return
   const path='/marketplace/requests/'+encodeURIComponent(id)+'/hold'
   if(release)await api.delete(path);else await api.post(path,{})
   if(active.current){setNotice(release?'Stock hold ended.':'Stock hold request processed.');await load()}
  }catch(e){if(active.current){fail(e,'Could not update stock hold.');await load()}}
  finally{locked.current=false;if(active.current)setDecisionBusy(false)}
 }
 async function prepare(row:PurchaseRequestRow){
  if(locked.current||!canPrepareCheckout(history,row))return
  locked.current=true;setDecisionBusy(true);setSubmissionError('');setNotice('')
  try{const approved=await confirm({title:'Review reserved items?',description:'Prepare a checkout draft for '+price(row.totalMinor)+'. No charge, confirmed order or delivery fee is created.',confirmLabel:'Prepare checkout draft'});if(!approved||!active.current)return;const result=await api.post<{checkoutEnabled:false;paymentCollected:false}>('/marketplace/requests/'+encodeURIComponent(row.id)+'/checkout-draft',{expectedTotalMinor:row.totalMinor});if(result.checkoutEnabled!==false||result.paymentCollected!==false)throw new Error('Unexpected checkout draft response.');if(active.current){setNotice('Checkout draft prepared. No payment collected.');await load()}}catch(e){if(active.current){fail(e,'Could not prepare checkout.');await load()}}finally{locked.current=false;if(active.current)setDecisionBusy(false)}
 }
 return <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Purchase requests">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">{seller?'Incoming purchase requests':'Your purchase requests'}</h2><p className="text-xs text-muted-foreground">Purchase requests are non-binding. Temporary stock holds are separate; no payment is collected.</p></div>
   <Button variant="outline" size="sm" disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh requests'}</Button></div>
  {!seller&&quote&&<Button disabled={submitting||decisionBusy} onClick={()=>void submit()}>{submitting?'Submitting…':'Submit purchase request · '+price(quote.totalMinor)}</Button>}
  {!seller&&!quote&&<p className="text-xs text-muted-foreground">Review your basket to submit a new request.</p>}
  <SubmissionFeedback message={submissionError} attempt={attempt}/>
  {notice&&<p role="status" className="break-all text-sm text-primary">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {history&&history.requests.length===0&&<p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No requests yet.</p>}
  {history?.requests.map(row=><article key={row.id} className="space-y-2 rounded-xl border p-4">
   <div className="flex justify-between gap-2"><strong>{price(row.totalMinor)}</strong><span className="text-xs font-semibold">{requestStatusLabel(row.status)}</span></div>
   <p className="break-all text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · {row.id}</p>
   {row.items.map(item=><div key={item.variantId} className="flex justify-between gap-3 text-sm"><span>{item.productName} · {item.variantTitle} × {item.quantity}</span><span className="shrink-0">{price(item.lineMinor)}</span></div>)}
   {row.stockHold&&<p className="rounded-lg bg-muted p-2 text-xs">Stock hold: {stockHoldLabel(row.stockHold,now)}{row.stockHold.status==='HELD'?' · Expires '+new Date(row.stockHold.expiresAt).toLocaleString():''}</p>}
   {row.stockHold?.checkoutDraft&&<p className="rounded-lg border p-2 text-xs">Checkout draft: {row.stockHold.checkoutDraft.status.toLowerCase()} · {price(row.stockHold.checkoutDraft.totalMinor)} · No payment collected</p>}
   <div className="flex flex-wrap gap-2">{canPrepareCheckout(history,row,now)&&<Button size="sm" disabled={decisionBusy||submitting||loading} onClick={()=>void prepare(row)}>Prepare checkout draft</Button>}{history?.stockHoldEnabled&&seller&&row.status==='ACKNOWLEDGED'&&!row.stockHold&&<Button size="sm" disabled={decisionBusy||submitting||loading} onClick={()=>void hold(row.id,false)}>Hold stock for 30 minutes</Button>}{row.stockHold?.status==='HELD'?<Button variant="outline" size="sm" disabled={decisionBusy||submitting||loading} onClick={()=>void hold(row.id,true)}>Release stock hold</Button>:null}{(row.stockHold?.status==='HELD'?[]:availableRequestDecisions(seller,row.status)).map(action=><Button key={action} size="sm" variant={action==='ACKNOWLEDGED'?'default':'outline'} disabled={decisionBusy||submitting||loading} onClick={()=>void decide(row.id,action)}>{decisionLabel(action)}</Button>)}</div>
  </article>)}
  {history&&history.requests.length===50&&<p className="text-xs text-muted-foreground">Showing the latest 50 requests.</p>}
 </section>
}
