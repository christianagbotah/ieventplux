'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, Loader2, Plus, ShieldCheck, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { MARKETPLACE_CATEGORIES, GHANA_REGIONS } from '@/lib/marketplace-options'
import { StoreLocationFields,emptyStoreLocation,locationPayload } from '../components/StoreLocationFields'
import { SubmissionFeedback } from '@/components/ui/submission-feedback'
import { MarketplaceSelect } from '../components/MarketplaceSelect'

type StoreRow={id:string;slug:string;name:string;tagline:string|null;category:string;status:string;verificationState:string;productCount:number}
export default function MarketplaceSellerStudio(){
  const {user,booted}=usePortal()
  const {toast}=useToast()
  const [stores,setStores]=useState<StoreRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [name,setName]=useState('')
  const [slug,setSlug]=useState('')
  const [category,setCategory]=useState('')
  const [tagline,setTagline]=useState('')
  const [description,setDescription]=useState('')
  const [city,setCity]=useState('')
  const [country,setCountry]=useState('Ghana')
  const [region,setRegion]=useState('')
  const [address,setAddress]=useState('')
  const [website,setWebsite]=useState('')
  const [location,setLocation]=useState(emptyStoreLocation)
  const [submitError,setSubmitError]=useState('')
  const [attempt,setAttempt]=useState(0)
  const refresh=useCallback(async()=>{
    try{
      const result=await api.get<{stores:StoreRow[]}>('/marketplace/stores?mine=1')
      setStores(result.stores);setError('')
    }catch(e){
      setStores([])
      setError(e instanceof ApiClientError?e.message:'Your seller accounts could not be loaded.')
    }finally{setLoading(false)}
  },[])
  useEffect(()=>{if(booted&&user?.id)void refresh();else if(booted)setLoading(false)},[booted,user?.id,refresh])
  function createSlug(raw:string){
    return raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'')
  }
  async function createStore(){
    if(busy)return
    setBusy(true);setSubmitError('')
    try{
      const result=await api.post<{store:{slug:string}}>('/marketplace/stores',{
        name,slug,tagline,category,description,country:country==='Ghana'?'GH':'',region,city,pickupAddress:address,website:website.trim()||null,...locationPayload(location),
      })
      setOpen(false)
      await refresh()
      toast({title:'Your storefront is created',description:'Add products, receive stock and publish your store when ready.'})
      navigate('/shop/'+result.store.slug)
    }catch(e){
      const message=e instanceof Error?e.message:'Check your store information.';setSubmitError(message);setAttempt(n=>n+1);toast({title:'Store was not created',description:message,variant:'destructive',duration:10000})
    }finally{setBusy(false)}
  }
  if(!booted)return <div className="mx-auto max-w-5xl px-4 py-16"><Loader2 className="size-7 animate-spin text-primary"/></div>
  if(!user)return <div className="mx-auto max-w-lg px-4 py-20 text-center">
    <Store className="mx-auto size-14 text-primary"/>
    <h1 className="mt-4 text-2xl font-extrabold">Start selling with iEventPlux</h1>
    <p className="mt-3 text-sm text-muted-foreground">Sign in or register to create an independent storefront that people can discover beyond one event.</p>
    <Button className="mt-6" onClick={()=>navigate('/signin')}>Sign in to start</Button>
  </div>
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-9 pb-16">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Badge variant="secondary" className="mb-3 gap-1"><Store className="size-3"/>SELLER STUDIO</Badge>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Your businesses, always open.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">Create independent stores, list detailed products and variants, and manage physical inventory. Commerce and delivery activation follow verified payment and fulfilment certification.</p>
      </div>
      <div className="flex gap-2"><Button variant="outline" onClick={()=>navigate('/shop')}>Browse marketplace</Button>
        <Button onClick={()=>{setName('');setSlug('');setCategory('');setTagline('');setDescription('');setWebsite('');setCity('');setCountry('Ghana');setRegion('');setAddress('');setLocation(emptyStoreLocation);setSubmitError('');setOpen(true)}}><Plus className="mr-2 size-4"/>New store</Button>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><Store className="size-7 text-primary"/><div><p className="text-2xl font-extrabold">{stores.length}</p><p className="text-xs text-muted-foreground">Owned storefronts</p></div></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><ClipboardList className="size-7 text-primary"/><div><p className="text-2xl font-extrabold">{stores.reduce((n,s)=>n+s.productCount,0)}</p><p className="text-xs text-muted-foreground">Product records</p></div></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="size-7 text-primary"/><div><p className="text-2xl font-extrabold">{stores.filter(s=>s.status==='ACTIVE').length}</p><p className="text-xs text-muted-foreground">Public storefronts</p></div></CardContent></Card>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    {loading?<div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading your stores…</div>:stores.length?
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map(s=><Card key={s.id} className="rounded-2xl border-border/70 transition-shadow hover:shadow-lg">
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{s.category}</Badge><Badge variant="outline">{s.status}</Badge></div><CardTitle className="mt-3">{s.name}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{s.tagline||'Configure this store and prepare your catalogue.'}</p>
          <p className="text-xs text-muted-foreground">{s.productCount} published product records · {s.verificationState==='VERIFIED'?'Seller verified':'Seller verification pending'}</p>
          <Button className="w-full" onClick={()=>navigate('/shop/'+s.slug)}>Manage store <ArrowRight className="ml-2 size-4"/></Button>
        </CardContent>
      </Card>)}
    </div>:<div className="rounded-2xl border border-dashed p-10 text-center">
      <Store className="mx-auto size-12 text-primary/40"/>
      <h2 className="mt-4 text-xl font-extrabold">Start your first storefront</h2>
      <p className="mt-2 text-sm text-muted-foreground">Showcase physical goods, craftsmanship and services with a memorable store address.</p>
      <Button className="mt-5" onClick={()=>setOpen(true)}><Plus className="mr-2 size-4"/>Create a store</Button>
    </div>}
    <div className="rounded-xl border bg-muted/40 p-4 text-xs leading-6 text-muted-foreground">
      <strong>Safety and payments:</strong> A published product does not imply seller identity verification or an active payment option. We will enable checkout only after verified payment callbacks, stock reservations, order management, delivery and refund workflows pass acceptance tests.
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] max-w-xl flex-col gap-3 overflow-hidden rounded-2xl" onOpenAutoFocus={e=>e.preventDefault()}>
        <DialogHeader><DialogTitle>Open your new storefront</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-1">
          <SubmissionFeedback message={submitError} attempt={attempt}/>
          <div><Label htmlFor="seller-name">Store name</Label><Input id="seller-name" value={name} maxLength={100} onChange={e=>{setName(e.target.value);setSlug(createSlug(e.target.value))}} placeholder="e.g. Ghana Cultural Crafts"/></div>
          <div><Label htmlFor="seller-slug">Store URL address</Label><Input id="seller-slug" value={slug} maxLength={60} onChange={e=>setSlug(e.target.value)} aria-describedby="seller-url"/><p id="seller-url" className="mt-1 break-all text-xs text-muted-foreground">ieventplux.lightworldtech.com/#/shop/{slug||'your-store'}</p></div>
          <div><Label htmlFor="seller-category">Business category</Label><MarketplaceSelect id="seller-category" value={category} onChange={setCategory} options={MARKETPLACE_CATEGORIES} placeholder="Choose business category"/></div>
          <div><Label htmlFor="seller-tagline">Tagline</Label><Input id="seller-tagline" value={tagline} maxLength={180} onChange={e=>setTagline(e.target.value)}/></div>
          <div><Label htmlFor="seller-description">What does your store do?</Label><Textarea id="seller-description" rows={3} value={description} maxLength={2400} onChange={e=>setDescription(e.target.value)}/></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="seller-country">Country</Label><MarketplaceSelect id="seller-country" value={country} onChange={v=>{setCountry(v);setRegion('')}} options={['Ghana']} placeholder="Choose country"/></div><div><Label htmlFor="seller-region">Region</Label><MarketplaceSelect id="seller-region" value={region} onChange={setRegion} options={GHANA_REGIONS} disabled={!country} placeholder="Choose region"/></div></div><div><Label htmlFor="seller-city">City</Label><Input id="seller-city" value={city} maxLength={90} onChange={e=>setCity(e.target.value)} placeholder="e.g. Accra"/></div>
          <div><Label htmlFor="seller-address">Business / pickup address</Label><Textarea id="seller-address" rows={2} maxLength={350} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street, landmark or GhanaPost GPS address"/></div><StoreLocationFields value={location} onChange={setLocation} disabled={busy} region={region}/><div><Label htmlFor="seller-website">Existing website (optional HTTPS)</Label><Input id="seller-website" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://yourdomain.com"/></div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3"><Button variant="outline" onClick={()=>setOpen(false)} disabled={busy}>Cancel</Button><Button disabled={busy||name.trim().length<3||slug.trim().length<4||category.trim().length<2||!country||!region||!city.trim()||!address.trim()} onClick={()=>void createStore()}>{busy&&<Loader2 className="mr-2 size-4 animate-spin"/>}Create store draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
