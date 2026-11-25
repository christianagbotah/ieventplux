'use client'
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {api} from '../api'
import {useToast} from '@/hooks/use-toast'
import {MarketplaceSettlementReviews} from './MarketplaceSettlementReviews'
import {MARKETPLACE_CATEGORIES} from '@/lib/marketplace-options'
type Rule={key:string;basisPoints:number;store:{slug:string;name:string}|null}
export function MarketplaceCommissionSettings(){
 const [rules,setRules]=useState<Rule[]|null>(null)
 const [scope,setScope]=useState<'global'|'category'|'store'>('global')
 const [target,setTarget]=useState('')
 const [percent,setPercent]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const {toast}=useToast()
 const load=useCallback(async()=>{try{setRules((await api.get<{rules:Rule[]}>('/marketplace/commission-settings')).rules);setError('')}catch(e){setError(e instanceof Error?e.message:'Commission settings unavailable.')}},[])
 useEffect(()=>{void load()},[load])
 async function save(remove=false){
  const match=/^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(percent)
  if(!remove&&!match){setError('Enter a percentage from 0 to 99.99.');return}
  const basisPoints=remove?null:Number(match![1])*100+Number((match![2]??'').padEnd(2,'0'))
  setBusy(true);setError('')
  try{await api.post('/marketplace/commission-settings',{scope,target,basisPoints});toast({title:remove?'Commission rule removed':'Commission rule saved'});await load()}catch(e){setError(e instanceof Error?e.message:'Unable to update rule.')}finally{setBusy(false)}
 }
 return <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
 <h2 className="text-xl font-bold">Marketplace commission</h2><p className="text-sm text-muted-foreground">Configure future marketplace rates. Store rules override category rules, which override the global rate. Checkout is disabled. Confirm your password in Profile → Security before making changes.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {rules&&<><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="commission-scope">Scope</Label><select id="commission-scope" className="h-11 w-full rounded-md border bg-background px-3" value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setTarget('')}}><option value="global">Global</option><option value="category">Category</option><option value="store">Individual store</option></select></div>
 {scope==='category'&&<div><Label htmlFor="commission-category">Category</Label><select id="commission-category" className="h-11 w-full rounded-md border bg-background px-3" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose category</option>{MARKETPLACE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>}
 {scope==='store'&&<div><Label htmlFor="commission-store">Store URL slug</Label><Input id="commission-store" value={target} onChange={e=>setTarget(e.target.value)} placeholder="e.g. my-store"/></div>}
 <div><Label htmlFor="commission-rate">Commission (%)</Label><Input id="commission-rate" value={percent} inputMode="decimal" onChange={e=>setPercent(e.target.value)} placeholder="e.g. 10.00"/></div></div>
 <div className="flex flex-wrap gap-2"><Button disabled={busy||(scope!=='global'&&!target)} onClick={()=>void save()}>Save rule</Button><Button variant="outline" disabled={busy||(scope!=='global'&&!target)} onClick={()=>void save(true)}>Remove rule</Button></div>
 <div className="space-y-2">{rules.length?rules.map(r=><div className="flex justify-between gap-2 rounded-lg border p-3 text-sm" key={r.key}><span className="break-all">{r.store?.name??r.key}</span><strong>{(r.basisPoints/100).toFixed(2)}%</strong></div>):<p className="text-sm text-muted-foreground">No commission rules are configured. No default rate is assumed.</p>}</div></>}
 <MarketplaceSettlementReviews/>
 <MarketplaceSettlementReviews kind="organization"/>
 </section>
}
