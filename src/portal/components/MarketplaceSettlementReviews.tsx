'use client'
import {useEffect,useState,useCallback} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {api} from '../api'
type Item={state:string;maskedAccount:string|null;bankName:string|null;store:{slug:string;name:string;status:string}}
export function MarketplaceSettlementReviews(){
 const [items,setItems]=useState<Item[]|null>(null)
 const [slug,setSlug]=useState('')
 const [code,setCode]=useState('')
 const [reviewed,setReviewed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const path='/marketplace/settlement-reviews'
 const load=useCallback(async()=>{try{setItems((await api.get<{items:Item[]}>(path)).items)}catch(e){setError(e instanceof Error?e.message:'Review list unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 async function verify(){setBusy(true);setError('');setNotice('');try{await api.post(path,{storeSlug:slug,subaccountCode:code,ownerReviewed:reviewed});setCode('');setReviewed(false);setSlug('');setNotice('Sandbox verification recorded. Live payments remain disabled.');await load()}catch(e){setError(e instanceof Error?e.message:'Verification failed.')}finally{setBusy(false)}}
 return <section className="space-y-3 border-t pt-5"><h3 className="text-lg font-bold">Seller settlement review (sandbox)</h3><p className="text-sm text-muted-foreground">Create or inspect test subaccounts in the Paystack dashboard. Confirm the test account belongs to this seller's onboarding case before verification. This does not approve real money settlement.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
 {items?.map(item=><div key={item.store.slug} className="rounded-lg border p-3 text-sm"><strong>{item.store.name}</strong><p>{item.state.replaceAll('_',' ').toLowerCase()}{item.maskedAccount?' · '+item.bankName+' '+item.maskedAccount:''}</p>{item.state==='REQUESTED'&&item.store.status!=='SUSPENDED'&&<Button size="sm" variant="outline" onClick={()=>{setSlug(item.store.slug);setReviewed(false);setCode('')}}>Review request</Button>}</div>)}
 {items?.length===0&&<p className="text-sm text-muted-foreground">No onboarding requests.</p>}
 {slug&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm font-semibold">Review {slug}</p><Label htmlFor="test-subaccount">Paystack test subaccount code</Label><Input id="test-subaccount" value={code} onChange={e=>setCode(e.target.value)} placeholder="ACCT_…" autoComplete="off"/><label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the seller mapping in the test provider dashboard.</label><Button disabled={busy||!reviewed||!code.trim()} onClick={()=>void verify()}>{busy?'Verifying…':'Verify test account'}</Button></div>}
 </section>
}
