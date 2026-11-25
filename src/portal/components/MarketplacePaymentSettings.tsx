'use client'
import {useEffect,useState} from 'react'
import {Wallet,ShieldCheck} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
import {useToast} from '@/hooks/use-toast'
import {DEFAULT_PREFERENCES,type PaymentPreferences} from '@/lib/marketplace-payment-preferences'
type Settings={preferences:PaymentPreferences;commissionBps:number|null;commissionScope:string|null;settlementStatus:'NOT_CONFIGURED'|'REQUESTED'|'SANDBOX_VERIFIED'|'REJECTED';settlementAccount:{maskedAccount:string|null;bankName:string|null}|null;checkoutEnabled:false}
export function MarketplacePaymentSettings({slug}:{slug:string}){
 const [settings,setSettings]=useState<Settings|null>(null)
 const [draft,setDraft]=useState<PaymentPreferences>(DEFAULT_PREFERENCES)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const {toast}=useToast()
 const path='/marketplace/stores/'+encodeURIComponent(slug)+'/payment-settings'
 useEffect(()=>{let active=true;setSettings(null);setError('');api.get<Settings>(path).then(data=>{if(active){setSettings(data);setDraft(data.preferences)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load payment settings.')});return()=>{active=false}},[path])
 async function save(){setBusy(true);setError('');try{const result=await api.patch<Settings>(path,draft);setSettings(result);setDraft(result.preferences);toast({title:'Payment preferences saved'})}catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}}
 async function requestReview(){setBusy(true);setError('');try{await api.post(path.replace(/payment-settings$/,'settlement-onboarding'),{});setSettings(await api.get<Settings>(path));toast({title:'Settlement onboarding requested'})}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 return <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Payment and settlement settings">
 <div className="flex items-start gap-3"><Wallet className="size-6 shrink-0 text-primary"/><div><h2 className="text-xl font-bold">Payment & settlement settings</h2><p className="text-sm text-muted-foreground">Choose how you would like to accept payments once checkout is available.</p></div></div>
 <div className="rounded-xl border border-amber-500/30 p-3 text-sm"><ShieldCheck className="mr-2 inline size-4"/>Checkout is disabled. Sandbox bank onboarding only. Live settlement is not available. No money will be collected.</div>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {!settings?<p className="text-sm text-muted-foreground">{error?'Payment preferences unavailable.':'Loading preferences…'}</p>:<>
 <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-semibold">Preferred payment methods</legend>
 {([['mobileMoney','Mobile money'],['card','Debit / credit card'],['cash','Cash on delivery / pickup']] as const).map(([key,label])=><label key={key} className="flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.checked})}/>{label}</label>)}
 </fieldset>
 <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-semibold">Preferred settlement destination</legend>{(['BANK','MOMO'] as const).map(value=><label key={value} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="radio" name={'destination-'+slug} value={value} checked={draft.destination===value} onChange={()=>setDraft({...draft,destination:value})}/>{value==='BANK'?'Bank account':'Mobile money wallet (subject to provider approval)'}</label>)}</fieldset>
 <div className="rounded-xl bg-muted/40 p-3 text-sm"><p>Configured platform commission: <strong>{settings.commissionBps===null?'Not configured':(settings.commissionBps/100).toFixed(2)+'%'}</strong></p><p className="mt-1 text-xs text-muted-foreground">Cash payments cannot be split automatically. Processing fees and tax arrangements remain subject to approval. Do not send account numbers or PINs here.</p></div>
 <Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save payment preferences'}</Button><div className="space-y-2 rounded-xl border p-3 text-sm"><strong>Settlement onboarding: {settings.settlementStatus.replaceAll('_',' ').toLowerCase()}</strong>{settings.settlementAccount?.maskedAccount&&<p>{settings.settlementAccount.bankName} · {settings.settlementAccount.maskedAccount} (test only)</p>}<p className="text-muted-foreground">Bank onboarding is handled by finance staff through Paystack. Never enter bank account numbers or PINs here. MoMo destination approval is pending.</p>{settings.settlementStatus==='NOT_CONFIGURED'&&<Button variant="outline" disabled={busy||settings.preferences.destination!=='BANK'||(!settings.preferences.mobileMoney&&!settings.preferences.card)} onClick={()=>void requestReview()}>Request settlement onboarding</Button>}</div></>}
 </section>
}
