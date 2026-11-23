'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, Globe, Search, ShoppingBag, Store, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'

type ShopRow = {
  id:string;slug:string;name:string;tagline:string|null;category:string
  logoUrl:string|null;coverUrl:string|null;country:string;city:string|null
  verificationState:string;productCount:number
}
export default function MarketplaceExplore() {
  const [query,setQuery]=useState('')
  const [stores,setStores]=useState<ShopRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=useCallback(async(q:string)=>{
    setLoading(true)
    try{
      const response=await api.get<{stores:ShopRow[]}>('/marketplace/stores'+(q?'?q='+encodeURIComponent(q):''))
      setStores(response.stores)
      setError('')
    }catch(e){
      setStores([])
      setError(e instanceof ApiClientError?e.message:'Could not load storefronts.')
    }finally{setLoading(false)}
  },[])
  useEffect(()=>{void load('')},[load])
  return <div className="min-h-[68dvh] pb-12">
    <section className="relative overflow-hidden border-b bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white">
      <div className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <Badge className="mb-4 border-emerald-400/30 bg-white/10 text-emerald-100"><Sparkles className="mr-1.5 size-3.5"/>iEventPlux Marketplace</Badge>
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">Discover creators, makers and local businesses. <span className="text-emerald-300">Anytime.</span></h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-50/80 sm:text-base">Find independent Ghanaian businesses and their products. Sellers can showcase collections with detailed specifications, variants and live stock information, independent of any one event.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={()=>navigate('/seller')} className="h-11 bg-white text-emerald-950 hover:bg-emerald-50"><Store className="mr-2 size-4"/>Create your store</Button>
          <Button variant="outline" className="h-11 border-white/30 bg-white/5 text-white hover:bg-white/15" onClick={()=>document.getElementById('marketplace-results')?.scrollIntoView({behavior:'smooth'})}>Explore stores <ArrowRight className="ml-2 size-4"/></Button>
        </div>
      </div>
    </section>
    <section id="marketplace-results" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Discover stores</p>
          <h2 className="mt-1 text-2xl font-extrabold">Independent businesses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only published stores are listed. Verification badges are shown only when confirmed.</p>
        </div>
        <form className="flex w-full gap-2 sm:max-w-sm" onSubmit={e=>{e.preventDefault();void load(query.trim())}}>
          <Input value={query} onChange={e=>setQuery(e.target.value)} maxLength={90} placeholder="Find products or shop names…" aria-label="Search stores" className="h-11"/>
          <Button type="submit" disabled={loading} className="h-11"><Search className="size-4"/></Button>
        </form>
      </div>
      {error&&<p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {loading?<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>{Array.from({length:6},(_,i)=><div key={i} className="h-60 animate-pulse rounded-2xl bg-muted" />)}</div>:
        stores.length?<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map(store=><Card key={store.id} className="group cursor-pointer overflow-hidden rounded-2xl border-border/70 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl" onClick={()=>navigate('/shop/'+store.slug)} role="link" tabIndex={0} aria-label={'Open '+store.name+' storefront'} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('/shop/'+store.slug)}}}>
            <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-900 to-slate-900">
              {store.coverUrl&&<img src={store.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-65"/>}
              {store.logoUrl?<img src={store.logoUrl} alt="" loading="lazy" className="relative z-10 size-16 rounded-xl border-2 border-white bg-white object-contain shadow"/>:<Store className="relative z-10 size-11 text-emerald-200"/>}
            </div>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-lg font-extrabold">{store.name}</h3>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"/>
              </div>
              {store.tagline&&<p className="line-clamp-2 text-sm text-muted-foreground">{store.tagline}</p>}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{store.category}</Badge>
                {store.verificationState==='VERIFIED'&&<Badge variant="secondary" className="gap-1"><BadgeCheck className="size-3"/>Verified seller</Badge>}
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="size-3.5"/>{[store.city,store.country].filter(Boolean).join(', ')}</p>
            </CardContent>
          </Card>)}
        </div>:<div className="mt-10 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <ShoppingBag className="mx-auto size-11 text-primary/40"/>
          <h3 className="mt-4 text-lg font-bold">No matching stores yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Be one of the first creators or merchants to publish a storefront.</p>
          <Button className="mt-5" onClick={()=>navigate('/seller')}>Open a store</Button>
        </div>}
      <div className="mt-9 rounded-2xl border bg-muted/40 p-4 text-xs leading-6 text-muted-foreground">
        <strong>Commerce rollout:</strong> Product catalogues and stock management are being introduced first. Buyer payments, shipping and refunds are not yet enabled on these new independent stores; no order will be charged before verified checkout is released.
      </div>
    </section>
  </div>
}
