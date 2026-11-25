'use client'
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
type Settings={settlementStatus:string;bankName:string|null;maskedAccount:string|null;eligible:boolean;canRequest:boolean;checkoutEnabled:false}
export function OrganizationSettlementSettings({orgId}:{orgId:string}){
 const [data,setData]=useState<Settings|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const path='/orgs/'+encodeURIComponent(orgId)+'/settlement-onboarding'
 const load=useCallback(async()=>{try{setData(await api.get<Settings>(path));setError('')}catch(e){setError(e instanceof Error?e.message:'Settlement status unavailable.')}},[path])
 useEffect(()=>{void load()},[load])
 async function request(){setBusy(true);setError('');try{await api.post(path,{});await load()}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 return <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6"><h2 className="text-lg font-bold">Direct event settlement (sandbox)</h2><p className="text-sm text-muted-foreground">Prepare a verified bank destination for future event ticket and souvenir split payments. This is separate from historical payout balances. No live transactions are enabled by this setting.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {data&&<><p className="text-sm">Status: <strong>{data.settlementStatus.replaceAll('_',' ').toLowerCase()}</strong></p>{data.maskedAccount&&<p className="text-sm">{data.bankName} · {data.maskedAccount} (test only)</p>}{!data.eligible&&<p className="text-sm text-muted-foreground">Complete Ghana organization verification first.</p>}{data.settlementStatus==='NOT_CONFIGURED'&&data.canRequest&&<Button disabled={busy} onClick={()=>void request()}>{busy?'Submitting…':'Request settlement onboarding'}</Button>}{data.eligible&&!data.canRequest&&data.settlementStatus==='NOT_CONFIGURED'&&<p className="text-sm text-muted-foreground">The organization owner with a verified email must submit this request.</p>}</>}
 </section>
}
