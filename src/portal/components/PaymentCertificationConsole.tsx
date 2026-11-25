'use client'
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
type Mode='DIRECT'|'STORE'|'ORGANIZATION'
type Case={reference:string;createdAt:string;beneficiaryKind:Mode|null;totalMinor:number;platformGrossMinor:number;beneficiaryGrossMinor:number;sandboxAttempt:{checkout:{status:string}|null;collectionEvidence:{allocation:string;verifiedAt:string}|null}|null}
type Data={enabled:boolean;amountMinor:number;splitAmountMinor:number;splitCommissionMinor:number;items:Case[];recipients:{kind:Mode;id:string;name:string}[];liveEnabled:false}
const money=(minor:number)=>'₵'+(minor/100).toFixed(2)
export function PaymentCertificationConsole(){
 const path='/admin/payment-certification'
 const [data,setData]=useState<Data|null>(null)
 const [mode,setMode]=useState<Mode>('DIRECT')
 const [recipient,setRecipient]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [checkout,setCheckout]=useState('')
 const [notice,setNotice]=useState('')
 const load=useCallback(async()=>{try{setData(await api.get<Data>(path))}catch(e){setError(e instanceof Error?e.message:'Certification unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 async function run(action:'INITIALIZE'|'VERIFY',caseId:string,selected:Mode){
  setBusy(true);setError('');setNotice('');setCheckout('')
  try{
   const result=await api.post<{checkoutUrl?:string;collection?:string;allocation?:string;reference:string}>(path,{action,caseId,mode:selected,confirmTestOnly:confirmed,...(action==='INITIALIZE'&&selected!=='DIRECT'?{beneficiaryId:recipient}:{})})
   if(result.checkoutUrl)setCheckout(result.checkoutUrl)
   else setNotice(result.allocation==='REVIEW_REQUIRED'?'Test collection confirmed. Split allocation and settlement remain unverified.':'Independent sandbox collection confirmed. No real purchase was activated.')
  }catch(e){setError(e instanceof Error?e.message:'Test operation not confirmed.')}
  finally{await load();setBusy(false);setConfirmed(false)}
 }
 const total=mode==='DIRECT'?data?.amountMinor??100:data?.splitAmountMinor??10000
 const commission=mode==='DIRECT'?total:data?.splitCommissionMinor??1000
 return <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
 <h2 className="text-xl font-bold">Payment certification lab</h2>
 <p className="text-sm text-muted-foreground">Certify direct and split sandbox collection. No real order, subscription, campaign, or payout is activated. Use provider test details only. Confirm your password in Profile → Security first.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}
 {data&&!data.enabled&&<p className="rounded-lg border p-3 text-sm">Sandbox transport disabled. Configure test credentials and the certification flag on the server.</p>}
 {data?.enabled&&<><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Test route<select className="h-11 w-full rounded-md border bg-background px-3" value={mode} onChange={e=>{setMode(e.target.value as Mode);setRecipient('');setConfirmed(false)}}><option value="DIRECT">Platform direct</option><option value="STORE">Marketplace seller split</option><option value="ORGANIZATION">Event organizer split</option></select></label>
 {mode!=='DIRECT'&&<label className="space-y-1 text-sm">Verified test beneficiary<select className="h-11 w-full rounded-md border bg-background px-3" value={recipient} onChange={e=>{setRecipient(e.target.value);setConfirmed(false)}}><option value="">Choose beneficiary</option>{data.recipients.filter(r=>r.kind===mode).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}</div>
 {mode!=='DIRECT'&&!data.recipients.some(r=>r.kind===mode)&&<p className="text-sm text-muted-foreground">Complete sandbox settlement onboarding for a beneficiary first.</p>}
 <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3"><div>Total <strong className="block">{money(total)}</strong></div><div>Platform gross <strong className="block">{money(commission)}</strong></div><div>Beneficiary gross <strong className="block">{money(total-commission)}</strong></div></div>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I authorize a test-only provider operation using my verified email.</label>
 <Button disabled={busy||!confirmed||(mode!=='DIRECT'&&!recipient)} onClick={()=>void run('INITIALIZE',crypto.randomUUID(),mode)}>Create {money(total)} test checkout</Button></>}
 {checkout&&<a href={checkout} target="_blank" rel="noopener noreferrer" className="block font-medium text-primary underline">Open Paystack test checkout</a>}
 <div className="space-y-2">{data?.items.map(item=>{const selected=item.beneficiaryKind??'DIRECT';const prefix='TEST-'+selected+'-';return <div key={item.reference} className="space-y-2 rounded-lg border p-3 text-sm"><p className="break-all font-medium">{item.reference}</p><p>{money(item.totalMinor)} · {selected} · {item.sandboxAttempt?.collectionEvidence?(item.sandboxAttempt.collectionEvidence.allocation==='REVIEW_REQUIRED'?'Collection confirmed; allocation review required':'Collection confirmed (test only)'):item.sandboxAttempt?.checkout?.status??'Prepared'}</p>
 {data.enabled&&item.sandboxAttempt?.checkout&&item.reference.startsWith(prefix)&&<Button size="sm" variant="outline" disabled={busy||!confirmed} onClick={()=>void run('VERIFY',item.reference.slice(prefix.length),selected)}>Verify with provider</Button>}</div>})}
 {data?.items.length===0&&<p className="text-sm text-muted-foreground">No certification cases yet.</p>}</div>
 </section>
}
