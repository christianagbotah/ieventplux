'use client'
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
type Case={reference:string;createdAt:string;sandboxAttempt:{checkout:{status:string}|null;collectionEvidence:{allocation:string;verifiedAt:string}|null}|null}
type Data={enabled:boolean;amountMinor:number;items:Case[];liveEnabled:false}
export function PaymentCertificationConsole(){
 const path='/admin/payment-certification'
 const [data,setData]=useState<Data|null>(null)
 const [confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [checkout,setCheckout]=useState('')
 const [notice,setNotice]=useState('')
 const load=useCallback(async()=>{try{setData(await api.get<Data>(path))}catch(e){setError(e instanceof Error?e.message:'Certification unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 async function run(action:'INITIALIZE'|'VERIFY',caseId:string){
  setBusy(true);setError('');setNotice('');setCheckout('')
  try{
   const result=await api.post<{checkoutUrl?:string;collection?:string;reference:string}>(path,{action,caseId,confirmTestOnly:confirmed})
   if(result.checkoutUrl)setCheckout(result.checkoutUrl)
   else setNotice('Independent sandbox collection confirmed. No subscription or real order was activated.')
  }catch(e){setError(e instanceof Error?e.message:'Test operation not confirmed.')}
  finally{await load();setBusy(false);setConfirmed(false)}
 }
 return <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
 <h2 className="text-xl font-bold">Payment certification lab</h2>
 <p className="text-sm text-muted-foreground">Test direct platform collection with a fixed ₵1.00 sandbox transaction. No actual subscription, advertising campaign, order, or live money is created. Use provider test payment details only. Confirm your password in Profile → Security first.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}
 {data&&!data.enabled&&<p className="rounded-lg border p-3 text-sm">Sandbox transport disabled. The deployment administrator must configure test credentials and enable the certification flag. No credentials are displayed here.</p>}
 {data?.enabled&&<><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I authorize a test-only provider operation using my verified email.</label>
 <Button disabled={busy||!confirmed} onClick={()=>void run('INITIALIZE',crypto.randomUUID())}>Create ₵1.00 test checkout</Button></>}
 {checkout&&<a href={checkout} target="_blank" rel="noopener noreferrer" className="block font-medium text-primary underline">Open Paystack test checkout</a>}
 <div className="space-y-2">{data?.items.map(item=><div key={item.reference} className="space-y-2 rounded-lg border p-3 text-sm"><p className="break-all font-medium">{item.reference}</p><p>{item.sandboxAttempt?.collectionEvidence?'Collection confirmed (test only)':item.sandboxAttempt?.checkout?.status??'Prepared'}</p>
 {data.enabled&&item.sandboxAttempt?.checkout&&<Button size="sm" variant="outline" disabled={busy||!confirmed} onClick={()=>void run('VERIFY',item.reference.slice('TEST-DIRECT-'.length))}>Verify with provider</Button>}</div>)}
 {data?.items.length===0&&<p className="text-sm text-muted-foreground">No certification cases yet.</p>}</div>
 </section>
}
