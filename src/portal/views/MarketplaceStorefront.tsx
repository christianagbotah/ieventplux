'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, BadgeCheck, Box, Camera, Pencil, CheckCircle2, Globe, Loader2, Package, Plus, ShieldAlert, Store, Truck } from 'lucide-react'
import { StoreLocationFields,emptyStoreLocation,locationPayload } from '../components/StoreLocationFields'
import { SubmissionFeedback } from '@/components/ui/submission-feedback'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useConfirm } from '@/components/ui/confirm-dialog-provider'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import {basketSelection,canAddBasketUnit,type StoreQuote} from '../lib/marketplace-basket'
import { usePortal } from '../store'
import { MARKETPLACE_CATEGORIES } from '@/lib/marketplace-options'
import { MarketplaceSelect } from '../components/MarketplaceSelect'
import {MarketplaceRequests} from '../components/MarketplaceRequests'
import {MarketplacePaymentSettings} from '../components/MarketplacePaymentSettings'

type Variant = {id:string;sku:string;title:string;priceMinor:number;available:number;currency:string;stockOnHand?:number;reserved?:number;active:boolean}
type Product = {id:string;slug:string;name:string;shortDesc:string|null;description:string;brand:string|null;category:string;productKind:string;specifications:Record<string,string>;images:string[];status:string;variants:Variant[]}
type Shop = {id:string;slug:string;name:string;tagline:string|null;description:string|null;category:string;status:string;verificationState:string;logoUrl:string|null;coverUrl:string|null;website:string|null;country:string;region?:string|null;city:string|null;currency:string;gpsAddress?:string|null;latitude?:number|null;longitude?:number|null}
type Detail = {store:Shop;products:Product[];canManage:boolean;checkoutEnabled:false}
const price=(v:number)=>'₵'+(v/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
function toMinor(raw:string){
 const match=/^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw.trim())
 if(!match)throw new Error('Prices must be positive Ghana cedi amounts with at most two decimal places.')
 const amount=Number(match[1])*100+Number((match[2]??'').padEnd(2,'0')||0)
 if(amount<=0||amount>100000000)throw new Error('Variant price is out of range.')
 return amount
}

export default function MarketplaceStorefront({slug}:{slug:string}) {
 const {user}=usePortal()
 const {toast}=useToast()
 const confirm=useConfirm()
 const [data,setData]=useState<Detail|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [branding,setBranding]=useState<'logo'|'cover'|null>(null)
 const [brandError,setBrandError]=useState('')
 const [brandAttempt,setBrandAttempt]=useState(0)
 const [formError,setFormError]=useState('')
 const [formAttempt,setFormAttempt]=useState(0)
 function reportFormError(title:string,e:unknown,fallback:string){const message=e instanceof Error?e.message:fallback;setFormError(message);setFormAttempt(n=>n+1);toast({title,description:message,variant:'destructive',duration:10000})}
 const [locationOpen,setLocationOpen]=useState(false)
 const [location,setLocation]=useState(emptyStoreLocation)
 const [locationError,setLocationError]=useState('')
 const [locationAttempt,setLocationAttempt]=useState(0)
 const logoInput=useRef<HTMLInputElement>(null)
 const coverInput=useRef<HTMLInputElement>(null)
 const [productOpen,setProductOpen]=useState(false)
 const [name,setName]=useState('')
 const [category,setCategory]=useState('')
 const [description,setDescription]=useState('')
 const [brand,setBrand]=useState('')
 const [specs,setSpecs]=useState<{field:string;value:string}[]>([])
 const [images,setImages]=useState<string[]>([])
 const [uploading,setUploading]=useState(false)
 const [productKind,setProductKind]=useState<'GOODS'|'SERVICE'|'DIGITAL'>('GOODS')
 const [variantLines,setVariantLines]=useState([{title:'Standard',sku:'',price:''}])
 const [priceVariant,setPriceVariant]=useState<Variant|null>(null)
 const [newPrice,setNewPrice]=useState('')
 const [stockVariant,setStockVariant]=useState<Variant|null>(null)
 const [delta,setDelta]=useState('10')
 const [reason,setReason]=useState('New stock received from supplier')
 const [basket,setBasket]=useState<Record<string,number>>({})
 const [quote,setQuote]=useState<StoreQuote|null>(null)
 const [quoteLoading,setQuoteLoading]=useState(false)
 const [quoteError,setQuoteError]=useState('')
 const quoteEpoch=useRef(0)
 const catalogueEpoch=useRef(0)
 const lines=basketSelection(basket)
 const unavailableLines=lines.filter(line=>!data?.products.some(p=>p.variants.some(v=>v.id===line.variantId&&v.available>=line.quantity)))
 const selectQty=(variantId:string,next:number,available:number)=>{
   if(!Number.isSafeInteger(next)||next<0||next>20||quoteLoading||loading||((basket[variantId]??0)<next&&next>available))return
   setBasket(prev=>{if(next>(prev[variantId]??0)&&!canAddBasketUnit(prev,variantId,available))return prev;const output={...prev};if(next===0)delete output[variantId];else output[variantId]=next;return output})
   quoteEpoch.current++;setQuote(null);setQuoteError('')
 }
 async function reviewBasket(){
   if(!lines.length||unavailableLines.length||quoteLoading||loading)return
   const request=++quoteEpoch.current
   setQuoteLoading(true);setQuoteError('');setQuote(null)
   try{
     const result=await api.post<StoreQuote>('/marketplace/stores/'+encodeURIComponent(slug)+'/quote',{items:lines})
     if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('The basket could not be safely reviewed.')
     if(request===quoteEpoch.current)setQuote(result)
   }catch(e){if(request===quoteEpoch.current)setQuoteError(e instanceof Error?e.message:'Current prices could not be verified. Refresh and try again.')}
   finally{if(request===quoteEpoch.current)setQuoteLoading(false)}
 }
 const load=useCallback(async()=>{
   const request=++catalogueEpoch.current
   quoteEpoch.current++;setQuote(null);setQuoteError('');setQuoteLoading(false)
   setLoading(true)
   try {
     const result=await api.get<Detail>('/marketplace/stores/'+encodeURIComponent(slug))
     if(request===catalogueEpoch.current){setData(result);setError('')}
   }catch(e){
     if(request===catalogueEpoch.current){setData(null);setError(e instanceof ApiClientError?e.message:'Store could not be loaded.')}
   }finally{if(request===catalogueEpoch.current)setLoading(false)}
 },[slug])
 useEffect(()=>{setData(null);setBasket({});setQuote(null);setQuoteError('');void load();return()=>{quoteEpoch.current++;catalogueEpoch.current++}},[load,user?.id])

 async function setStoreStatus(status:'DRAFT'|'ACTIVE'){
   if(!data||busy)return
   const approved=await confirm({
     title:status==='ACTIVE'?'Publish your storefront?':'Unpublish this storefront?',
     description:status==='ACTIVE'
       ?'Your store and published products will be publicly discoverable. Orders and payments are not yet enabled in this marketplace module.'
       :'Your store will disappear from public discovery until you publish again.',
     confirmLabel:status==='ACTIVE'?'Publish store':'Unpublish store',
   })
   if(!approved)return
   setBusy(true)
   try{
     await api.patch('/marketplace/stores/'+encodeURIComponent(slug),{status})
     await load()
     toast({title:status==='ACTIVE'?'Store published':'Store hidden from public discovery'})
   }catch(e){
     toast({title:'Unable to change store status',description:e instanceof ApiClientError?e.message:'Try again.',variant:'destructive'})
   }finally{setBusy(false)}
 }

 async function saveLocation(){
   if(busy||!data?.canManage)return
   setBusy(true);setLocationError('')
   try{
     await api.patch('/marketplace/stores/'+encodeURIComponent(slug),locationPayload(location))
     setLocationOpen(false);await load();toast({title:'Store location saved'})
   }catch(e){const message=e instanceof Error?e.message:'Location could not be saved.';setLocationError(message);setLocationAttempt(n=>n+1);toast({title:'Location not saved',description:message,variant:'destructive',duration:10000})}
   finally{setBusy(false)}
 }
 async function uploadBrand(file:File|undefined,purpose:'logo'|'cover'){
   if(!file||!data?.canManage||branding||busy)return
   setBranding(purpose);setBrandError('')
   try{
     const form=new FormData();form.append('file',file);form.append('purpose',purpose)
     const result=await api.upload<{url:string}>('/marketplace/stores/'+encodeURIComponent(slug)+'/images',form)
     setData(current=>current&&current.store.slug===slug?{...current,store:{...current.store,[purpose==='logo'?'logoUrl':'coverUrl']:result.url}}:current)
     toast({title:purpose==='logo'?'Store logo updated':'Store banner updated'})
   }catch(e){const message=e instanceof Error?e.message:'Image could not be uploaded.';setBrandError(message);setBrandAttempt(n=>n+1);toast({title:'Image not updated',description:message,variant:'destructive',duration:10000})}
   finally{setBranding(null)}
 }
 async function uploadImages(files:FileList|null,featured:boolean){
   if(!files?.length||uploading||busy)return
   setUploading(true);setFormError('')
   try{
     const limit=featured?1:Math.max(0,10-images.length)
     if(files.length>limit)throw new Error('Choose no more than the remaining image slots (10 total).')
     const uploaded:string[]=[]
     for(const file of Array.from(files)){const form=new FormData();form.append('file',file);const result=await api.upload<{url:string}>('/marketplace/stores/'+encodeURIComponent(slug)+'/images',form);uploaded.push(result.url)}
     setImages(prev=>featured?[uploaded[0],...prev.slice(1)]:[...prev,...uploaded]);toast({title:'Images uploaded'})
   }catch(e){reportFormError('Image upload failed',e,'Try a JPG, PNG or WebP image.')}finally{setUploading(false)}
 }
 async function submitProduct(){
   if(!data||busy||uploading)return
   setBusy(true);setFormError('')
   try{
     const variants=variantLines.map((line,i)=>({title:line.title.trim(),sku:line.sku.trim()||('SKU-'+crypto.randomUUID().slice(0,8).toUpperCase()+'-'+(i+1)),priceMinor:toMinor(line.price),optionValues:{}}))
     const specifications:Record<string,string>={}
     for(const {field,value} of specs){if(!field.trim()&&!value.trim())continue;if(!field.trim()||!value.trim())throw new Error('Complete both specification fields.');if(Object.hasOwn(specifications,field.trim()))throw new Error('Each specification name must be unique.');specifications[field.trim()]=value.trim()}
     const productSlug=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
       .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'')
     await api.post('/marketplace/stores/'+encodeURIComponent(slug)+'/products',{
       name,slug:productSlug,shortDesc:description.slice(0,180),description,
       brand,category,productKind,
       specifications,images,
       variants,
     })
     await load()
     setProductOpen(false)
     setName('');setDescription('');setSpecs([]);setImages([]);setBrand('');setProductKind('GOODS');setVariantLines([{title:'Standard',sku:'',price:''}])
     toast({title:'Product draft created',description:'Receive stock and publish the product when ready.'})
   }catch(e){
     reportFormError('Could not create product',e,'Check the form.')
   }finally{setBusy(false)}
 }

 async function publishProduct(product:Product,status:'ACTIVE'|'ARCHIVED'){
   if(busy)return
   const approved=await confirm({
     title:status==='ACTIVE'?'Publish this product?':'Archive this product?',
     description:status==='ACTIVE'?'Customers will see its product details, prices and available stock. Checkout stays disabled.':'It will be hidden from shoppers. This operation cannot be reversed from the current seller portal.',
     confirmLabel:status==='ACTIVE'?'Publish product':'Archive product',
     tone:status==='ARCHIVED'?'danger':'normal',
   })
   if(!approved)return
   setBusy(true)
   try{
     await api.patch('/marketplace/products/'+product.id,{status})
     await load()
     toast({title:status==='ACTIVE'?'Product published':'Product archived'})
   }catch(e){
     toast({title:'Unable to update product',description:e instanceof ApiClientError?e.message:'Try again.',variant:'destructive'})
   }finally{setBusy(false)}
 }

 async function savePrice(){
   if(!priceVariant||busy)return
   setBusy(true);setFormError('')
   try{
     await api.patch('/marketplace/variants/'+encodeURIComponent(priceVariant.id)+'/price',{priceMinor:toMinor(newPrice),expectedPriceMinor:priceVariant.priceMinor})
     setPriceVariant(null)
     await load()
     toast({title:'Product price updated'})
   }catch(e){reportFormError('Price not updated',e,'Try again.')}
   finally{setBusy(false)}
 }

 async function adjustStock(){
   if(!stockVariant||busy)return
   const amount=Number(delta)
   if(!Number.isSafeInteger(amount)||amount===0){
     reportFormError('Invalid stock quantity',new Error('Enter a nonzero whole-number stock change.'),'Check quantity.')
     return
   }
   const approved=await confirm({
     title:'Confirm inventory adjustment?',
     description:'Change stock for '+stockVariant.sku+' by '+amount+' units. The adjustment is recorded in the permanent stock history.',
     confirmLabel:'Record stock movement',tone:amount<0?'danger':'normal',
   })
   if(!approved)return
   setBusy(true)
   try{
     await api.post('/marketplace/variants/'+stockVariant.id+'/stock',{
       delta:amount,reason,requestKey:crypto.randomUUID().replace(/-/g,''),
     })
     await load()
     setStockVariant(null)
     toast({title:'Stock movement recorded',description:'Available inventory has been recalculated.'})
   }catch(e){
     reportFormError('Stock was not changed',e,'Try again.')
   }finally{setBusy(false)}
 }

 if(loading&&!data)return <div className="mx-auto max-w-6xl px-4 py-16"><Loader2 className="mx-auto size-8 animate-spin text-primary"/><p className="mt-3 text-center text-muted-foreground">Loading storefront…</p></div>
 if(!data)return <div className="mx-auto max-w-xl px-4 py-24 text-center">
  <ShieldAlert className="mx-auto size-12 text-muted-foreground"/><h1 className="mt-3 text-xl font-bold">Store unavailable</h1>
  <p className="mt-2 text-sm text-muted-foreground">{error||'This store may be private or unavailable.'}</p>
  <Button className="mt-5" onClick={()=>navigate('/shop')}>Return to marketplace</Button>
 </div>
 return <div className="space-y-0 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
  <div className="relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-800 to-slate-900 sm:h-52">
    {data.store.coverUrl&&<img src={data.store.coverUrl} alt="" className="h-full w-full object-cover"/>}
    {data.canManage&&data.store.status!=='SUSPENDED'&&<><input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{void uploadBrand(e.target.files?.[0],'cover');e.target.value=''}}/><Button type="button" variant="secondary" size="sm" className="absolute right-3 top-3 min-h-11 gap-1 shadow" disabled={!!branding||busy} onClick={()=>coverInput.current?.click()}>{branding==='cover'?<Loader2 className="size-4 animate-spin"/>:<Camera className="size-4"/>} Edit banner</Button></>}
    <button type="button" onClick={()=>navigate('/shop')} className="absolute left-3 top-3 flex min-h-11 items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm"><ArrowLeft className="size-4"/>Marketplace</button>
  </div>
  <div className="space-y-5 px-1 sm:space-y-6">
    <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 pt-3 sm:gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="relative -mt-9 w-fit">{data.store.logoUrl?<img src={data.store.logoUrl} alt="" className="size-20 rounded-2xl border-4 border-background bg-white object-contain shadow-xl"/>:
        <div className="grid size-20 place-items-center rounded-2xl border-4 border-background bg-primary text-white shadow-xl"><Store className="size-8"/></div>}
      {data.canManage&&data.store.status!=='SUSPENDED'&&<><input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{void uploadBrand(e.target.files?.[0],'logo');e.target.value=''}}/><button type="button" aria-label="Edit store logo" title="Edit logo" className="absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow" disabled={!!branding||busy} onClick={()=>logoInput.current?.click()}>{branding==='logo'?<Loader2 className="size-4 animate-spin"/>:<Pencil className="size-4"/>}</button></>}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-xl font-bold sm:text-2xl">{data.store.name}</h1>
          {data.store.verificationState==='VERIFIED'&&<Badge variant="secondary" className="gap-1"><BadgeCheck className="size-3"/>Verified</Badge>}
          {data.canManage&&<Badge variant="outline">{data.store.status}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{data.store.tagline||data.store.category}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Globe className="size-3.5"/>{[data.store.city,data.store.region,data.store.country==='GH'?'Ghana':data.store.country].filter(Boolean).join(', ')} <span>·</span> {data.store.category}</p>
      </div>
      {data.canManage&&<div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
        <Button size="sm" className="min-h-11" variant="outline" onClick={()=>navigate('/seller')}>Seller studio</Button>
        <Button size="sm" className="min-h-11" variant="outline" disabled={busy||data.store.status==='SUSPENDED'} onClick={()=>{setLocation({gpsAddress:data.store.gpsAddress??'',latitude:data.store.latitude?.toString()??'',longitude:data.store.longitude?.toString()??''});setLocationError('');setLocationOpen(true)}}>Edit location</Button>
        <Button size="sm" className="min-h-11" disabled={busy} onClick={()=>void setStoreStatus(data.store.status==='ACTIVE'?'DRAFT':'ACTIVE')}>
          {data.store.status==='ACTIVE'?'Unpublish store':'Publish store'}
        </Button>
      </div>}
    </div>
    {data.canManage&&<><SubmissionFeedback message={brandError} attempt={brandAttempt}/><p className="text-xs text-muted-foreground">Logo: 512 × 512 · Banner: 1600 × 600 · JPG, PNG or WebP, max 5 MB. Public images.</p></>}
    {data.store.description&&<p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{data.store.description}</p>}
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-extrabold sm:text-2xl">Product catalogue</h2>
          <p className="mt-1 text-sm text-muted-foreground">Detailed goods, seller-defined variants and current available stock.</p>
        </div>
        {data.canManage&&<Button onClick={()=>{setCategory(data.store.category);setFormError('');setProductOpen(true)}}><Plus className="mr-2 size-4"/>Add product</Button>}
      </div>
      {data.products.length?<div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.products.map(product=><Card key={product.id} className="overflow-hidden rounded-2xl border-border/70">
          <div className="grid h-44 place-items-center bg-gradient-to-br from-muted via-background to-muted">
            {product.images[0]?<img src={product.images[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover"/>:<Package className="size-11 text-primary/40"/>}
          </div>
          <CardContent className="space-y-3 p-4">
            {product.images.length>1&&<div className="flex gap-2 overflow-x-auto">{product.images.slice(1).map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} alt={product.name+' gallery '+(i+1)} className="size-16 rounded-md object-cover"/></a>)}</div>}
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{product.category}</Badge>{data.canManage&&<Badge variant="outline">{product.status}</Badge>}</div>
            <h3 className="line-clamp-2 text-base font-extrabold">{product.name}</h3>
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            {Object.keys(product.specifications).length>0&&<div className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
              {Object.entries(product.specifications).slice(0,8).map(([k,v])=><div className="flex gap-2" key={k}><span className="min-w-0 flex-1 text-muted-foreground">{k}</span><span className="min-w-0 flex-1 text-right font-semibold">{v}</span></div>)}
            </div>}
            <div className="space-y-2">
              {product.variants.map(v=><div key={v.id} className="rounded-xl border bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{v.title}</span><span className="text-base font-extrabold text-primary">{price(v.priceMinor)}</span></div>
                <p className="mt-1 text-muted-foreground">SKU: {v.sku}{product.productKind==='GOODS'?' · Available: '+v.available:''}</p>
                {!data.canManage&&product.productKind==='GOODS'&&<div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{v.available>0?'Select quantity':'Unavailable'}</span>
                  <div className="flex items-center gap-2" role="group" aria-label={`${product.name}, ${v.title}, quantity`}>
                    <Button type="button" size="sm" variant="outline" className="size-9 p-0" disabled={!basket[v.id]||quoteLoading||loading}
                      onClick={()=>selectQty(v.id,(basket[v.id]??0)-1,v.available)} aria-label={`Remove one ${v.title}`}>−</Button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">{basket[v.id]??0}</span>
                    <Button type="button" size="sm" variant="outline" className="size-9 p-0"
                      disabled={!canAddBasketUnit(basket,v.id,v.available)||quoteLoading||loading}
                      onClick={()=>selectQty(v.id,(basket[v.id]??0)+1,v.available)} aria-label={`Add one ${v.title}`}>+</Button>
                  </div>
                </div>}
                {data.canManage&&v.active&&product.status!=='ARCHIVED'&&data.store.status!=='SUSPENDED'&&<Button size="sm" variant="outline" className="mt-2 w-full" disabled={busy} onClick={()=>{setFormError('');setPriceVariant(v);setNewPrice((v.priceMinor/100).toFixed(2))}}>Edit price</Button>}
                {data.canManage&&product.productKind==='GOODS'&&<Button size="sm" variant="outline" className="mt-2 w-full" onClick={()=>{setFormError('');setStockVariant(v);setDelta('10');setReason('New stock received from supplier')}}>Adjust inventory</Button>}
              </div>)}
            </div>
            {data.canManage&&product.status==='DRAFT'&&<Button className="w-full" disabled={busy} onClick={()=>void publishProduct(product,'ACTIVE')}>Publish product</Button>}
            {data.canManage&&product.status==='ACTIVE'&&<Button className="w-full" size="sm" variant="outline" disabled={busy} onClick={()=>void publishProduct(product,'ARCHIVED')}>Archive product</Button>}
            {!data.canManage&&<Button className="w-full" disabled><Truck className="mr-2 size-4"/>Checkout launching later</Button>}
          </CardContent>
        </Card>)}
      </div>:<div className="rounded-2xl border border-dashed px-5 py-14 text-center"><Box className="mx-auto size-12 text-primary/30"/><h3 className="mt-3 font-bold">No published products yet</h3><p className="mt-2 text-sm text-muted-foreground">{data.canManage?'Add your first product and its variants to begin.':'Check this store again as it adds products.'}</p></div>}
    </section>
    {!data.canManage&&<section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-6" aria-label="Basket price and stock review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-extrabold">Review selected items</h2>
          <p className="mt-1 text-xs text-muted-foreground">{lines.reduce((n,line)=>n+line.quantity,0)} units across {lines.length} options · Stock and prices checked on the server</p></div>
        <Button disabled={!lines.length||unavailableLines.length>0||quoteLoading||loading} onClick={()=>void reviewBasket()}>
          {quoteLoading?<Loader2 className="mr-2 size-4 animate-spin"/>:<CheckCircle2 className="mr-2 size-4"/>}
          {quoteLoading?'Checking catalogue…':'Check prices & stock'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Up to 15 options and 50 units per review.</p>
        {lines.length>0&&<Button variant="outline" size="sm" disabled={loading||quoteLoading} onClick={()=>{quoteEpoch.current++;setBasket({});setQuote(null);setQuoteError('')}}>Clear selection</Button>}
      </div>
      {unavailableLines.length>0&&!loading&&<p role="alert" className="mt-3 rounded-xl border p-3 text-sm">Some selected items are no longer available in the chosen quantity. Reduce their quantities or clear the selection to start again.</p>}
      {quoteError&&<div role="alert"  className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{quoteError}</div>}
      {quote&&<div className="mt-4 space-y-3 rounded-xl border bg-card p-4" role="status">
        {quote.items.map(item=><div key={item.variantId} className="flex flex-wrap justify-between gap-3 border-b pb-2 text-sm">
          <div><span className="font-semibold">{item.productName}</span> <span className="text-muted-foreground">{item.variantTitle} × {item.quantity}</span></div>
          <span className="font-bold tabular-nums">{price(item.lineMinor)}</span>
        </div>)}
        <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">Merchandise subtotal</span><strong className="text-xl tabular-nums text-primary">{price(quote.totalMinor)}</strong></div>
        <p className="text-xs text-muted-foreground">{quote.notice} Delivery fees, taxes, and final payment are not calculated. Checked at {new Date(quote.quotedAt).toLocaleTimeString()}.</p>
      </div>}
      {!quote&&<p className="mt-3 text-xs text-muted-foreground">Select available variants above, then check the live catalogue. No inventory is held and no order or payment will be created.</p>}
    </section>}
    {data.canManage&&<MarketplacePaymentSettings key={slug} slug={slug}/>}
    {user&&<MarketplaceRequests key={user.id+':'+slug+':'+data.canManage} slug={slug} seller={data.canManage} quote={quote} onSubmitted={submitted=>setQuote(current=>current===submitted?null:current)}/>}
    {!user&&!data.canManage&&<Button variant="outline" onClick={()=>navigate('/signin')}>Sign in to submit purchase requests</Button>}
    <p className="rounded-xl border bg-muted/30 p-4 text-xs leading-6 text-muted-foreground">
      <CheckCircle2 className="mr-1 inline size-4 text-primary"/> Product listings show seller-provided descriptions and inventory. Platform checkout, order delivery and refunds are not yet enabled for independent stores. Unverified sellers are not represented as verified.
    </p>
  </div>
  <Dialog open={locationOpen} onOpenChange={open=>{if(!busy)setLocationOpen(open)}}>
    <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] max-w-lg flex-col gap-3 overflow-hidden rounded-2xl">
      <DialogHeader><DialogTitle>Store location</DialogTitle></DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1"><SubmissionFeedback message={locationError} attempt={locationAttempt}/><StoreLocationFields value={location} onChange={setLocation} disabled={busy}/></div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setLocationOpen(false)}>Cancel</Button><Button disabled={busy} onClick={()=>void saveLocation()}>{busy?'Saving…':'Save location'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <Dialog open={productOpen} onOpenChange={setProductOpen}>
    <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] max-w-2xl flex-col gap-3 overflow-hidden rounded-2xl" onOpenAutoFocus={e=>e.preventDefault()}>
      <DialogHeader><DialogTitle>Add a new product</DialogTitle></DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-1">
        <SubmissionFeedback message={formError} attempt={formAttempt}/>
        <div><Label htmlFor="product-name">Product name</Label><Input id="product-name" maxLength={150} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Handwoven Kente cloth"/></div>
        <div><Label htmlFor="product-category">Category</Label><MarketplaceSelect id="product-category" options={MARKETPLACE_CATEGORIES} value={category} onChange={setCategory} placeholder="Choose product category"/></div>
        <div><Label htmlFor="product-kind">Listing type</Label><select id="product-kind" className="h-11 w-full rounded-md border border-input bg-background px-3" value={productKind} onChange={e=>setProductKind(e.target.value as typeof productKind)}><option value="GOODS">Physical product</option><option value="SERVICE">Service (catalogue listing only)</option><option value="DIGITAL">Digital product (catalogue listing only)</option></select></div><div><Label htmlFor="product-brand">Brand or manufacturer (optional)</Label><Input id="product-brand" maxLength={100} value={brand} onChange={e=>setBrand(e.target.value)}/></div>
        <div><Label htmlFor="product-description">Full description</Label><Textarea id="product-description" rows={5} maxLength={8000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Materials, size, care, origin, condition and other product details"/></div>
        <div className="space-y-2"><Label>Product specifications (optional)</Label><p className="text-xs text-muted-foreground">Add size, material, RAM, storage, colour, service duration or any other relevant detail.</p>{specs.map((spec,i)=><div key={i} className="grid grid-cols-1 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label={'Specification name '+(i+1)} placeholder="e.g. RAM" value={spec.field} onChange={e=>setSpecs(prev=>prev.map((row,j)=>j===i?{...row,field:e.target.value}:row))}/><Input aria-label={'Specification value '+(i+1)} placeholder="e.g. 16 GB" value={spec.value} onChange={e=>setSpecs(prev=>prev.map((row,j)=>j===i?{...row,value:e.target.value}:row))}/><Button type="button" variant="outline" size="sm" onClick={()=>setSpecs(prev=>prev.filter((_,j)=>j!==i))}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" disabled={specs.length>=30} onClick={()=>setSpecs(prev=>[...prev,{field:'',value:''}])}>Add specification</Button></div>
        <div className="space-y-3"><Label htmlFor="product-featured">Featured image</Label><Input id="product-featured" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||busy} onChange={e=>{void uploadImages(e.target.files,true);e.target.value=''}}/><Label htmlFor="product-gallery">Gallery images (up to 9 additional)</Label><Input id="product-gallery" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading||busy||!images.length||images.length>=10} onChange={e=>{void uploadImages(e.target.files,false);e.target.value=''}}/>{uploading&&<p role="status" className="text-sm">Uploading images…</p>}<div className="grid grid-cols-3 gap-2">{images.map((url,i)=><div key={url} className="min-w-0 space-y-1"><img src={url} alt={i===0?'Featured image':'Gallery image'} className="aspect-square w-full rounded-lg object-cover"/><p className="text-xs">{i===0?'Featured':'Gallery'}</p><Button type="button" size="sm" variant="outline" className="w-full" disabled={busy||uploading} onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))}>Remove</Button></div>)}</div><p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB each. Listing images are public; do not upload private documents.</p></div>
        <div className="space-y-2"><Label>Price and variants</Label>{variantLines.map((v,i)=><div key={i} className="space-y-2 rounded-xl border p-3"><Label htmlFor={'variant-title-'+i}>Option name</Label><Input id={'variant-title-'+i} value={v.title} placeholder="e.g. Large / Black" onChange={e=>setVariantLines(prev=>prev.map((r,j)=>j===i?{...r,title:e.target.value}:r))}/><div className="grid gap-2 sm:grid-cols-2"><div><Label htmlFor={'variant-sku-'+i}>SKU (optional)</Label><Input id={'variant-sku-'+i} value={v.sku} placeholder="Automatically generated" onChange={e=>setVariantLines(prev=>prev.map((r,j)=>j===i?{...r,sku:e.target.value}:r))}/></div><div><Label htmlFor={'variant-cost-'+i}>Price (₵)</Label><Input id={'variant-cost-'+i} value={v.price} inputMode="decimal" placeholder="0.00" onChange={e=>setVariantLines(prev=>prev.map((r,j)=>j===i?{...r,price:e.target.value}:r))}/></div></div>{variantLines.length>1&&<Button type="button" size="sm" variant="outline" onClick={()=>setVariantLines(prev=>prev.filter((_,j)=>j!==i))}>Remove option</Button>}</div>)}<Button type="button" variant="outline" size="sm" disabled={variantLines.length>=24} onClick={()=>setVariantLines(prev=>[...prev,{title:'',sku:'',price:''}])}>Add variant</Button></div>
        <p className="text-xs text-muted-foreground">Physical stock starts at zero. Add stock after creating a draft. Services and digital items can be listed but do not support purchase requests or checkout yet.</p>
      </div>
      <DialogFooter className="shrink-0 border-t pt-3"><Button variant="outline" onClick={()=>setProductOpen(false)} disabled={busy||uploading}>Cancel</Button><Button disabled={busy||uploading||!category||variantLines.some(v=>!v.title.trim()||!v.price.trim())||name.trim().length<3||description.trim().length<15} onClick={()=>void submitProduct()}>{busy&&<Loader2 className="mr-1 size-4 animate-spin"/>}Create draft</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <Dialog open={priceVariant!==null} onOpenChange={open=>{if(!open&&!busy)setPriceVariant(null)}}>
    <DialogContent className="rounded-2xl">
      <DialogHeader><DialogTitle>Edit product price</DialogTitle></DialogHeader>
      <SubmissionFeedback message={formError} attempt={formAttempt}/>
      <p className="text-sm text-muted-foreground">{priceVariant?.title} · SKU {priceVariant?.sku}. Stock quantities are not changed.</p>
      <div><Label htmlFor="variant-price">New price (₵)</Label><Input id="variant-price" inputMode="decimal" value={newPrice} onChange={e=>setNewPrice(e.target.value)} disabled={busy}/></div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setPriceVariant(null)}>Cancel</Button><Button disabled={busy||!newPrice.trim()} onClick={()=>void savePrice()}>{busy?'Saving…':'Save price'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <Dialog open={stockVariant!==null} onOpenChange={open=>{if(!open)setStockVariant(null)}}>
    <DialogContent className="rounded-2xl">
      <DialogHeader><DialogTitle>Adjust physical inventory</DialogTitle></DialogHeader>
      <SubmissionFeedback message={formError} attempt={formAttempt}/>
      <p className="text-sm text-muted-foreground">Variant: <strong>{stockVariant?.sku}</strong>. Use a positive number to receive goods or a negative number to record an authorized stock reduction.</p>
      <div><Label htmlFor="stock-delta">Quantity change</Label><Input id="stock-delta" inputMode="numeric" value={delta} onChange={e=>setDelta(e.target.value)}/></div>
      <div><Label htmlFor="stock-reason">Reason for this inventory movement</Label><Textarea id="stock-reason" value={reason} maxLength={200} onChange={e=>setReason(e.target.value)}/></div>
      <DialogFooter><Button variant="outline" onClick={()=>setStockVariant(null)} disabled={busy}>Cancel</Button><Button disabled={busy||!reason.trim()} onClick={()=>void adjustStock()}>Record adjustment</Button></DialogFooter>
    </DialogContent>
  </Dialog>
 </div>
}
