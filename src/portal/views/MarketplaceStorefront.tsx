'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, Box, CheckCircle2, Globe, Loader2, Package, Plus, ShieldAlert, Store, Truck } from 'lucide-react'
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
import {basketSelection,type StoreQuote} from '../lib/marketplace-basket'
import { usePortal } from '../store'

type Variant = {id:string;sku:string;title:string;priceMinor:number;available:number;currency:string;stockOnHand?:number;reserved?:number;active:boolean}
type Product = {id:string;slug:string;name:string;shortDesc:string|null;description:string;brand:string|null;category:string;productKind:string;specifications:Record<string,string>;images:string[];status:string;variants:Variant[]}
type Shop = {id:string;slug:string;name:string;tagline:string|null;description:string|null;category:string;status:string;verificationState:string;logoUrl:string|null;coverUrl:string|null;website:string|null;country:string;city:string|null;currency:string}
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
 const [productOpen,setProductOpen]=useState(false)
 const [name,setName]=useState('')
 const [category,setCategory]=useState('')
 const [description,setDescription]=useState('')
 const [brand,setBrand]=useState('')
 const [specs,setSpecs]=useState('')
 const [images,setImages]=useState('')
 const [variantLines,setVariantLines]=useState('Standard | SKU-001 | 10.00')
 const [stockVariant,setStockVariant]=useState<Variant|null>(null)
 const [delta,setDelta]=useState('10')
 const [reason,setReason]=useState('New stock received from supplier')
 const [basket,setBasket]=useState<Record<string,number>>({})
 const [quote,setQuote]=useState<StoreQuote|null>(null)
 const [quoteLoading,setQuoteLoading]=useState(false)
 const [quoteError,setQuoteError]=useState('')
 const lines=basketSelection(basket)
 const selectQty=(variantId:string,next:number,available:number)=>{
   if(!Number.isSafeInteger(next)||next<0||next>Math.min(available,20))return
   setBasket(prev=>{const output={...prev};if(next===0)delete output[variantId];else output[variantId]=next;return output})
   setQuote(null);setQuoteError('')
 }
 async function reviewBasket(){
   if(!lines.length||quoteLoading)return
   setQuoteLoading(true);setQuoteError('');setQuote(null)
   try{
     const result=await api.post<StoreQuote>('/marketplace/stores/'+encodeURIComponent(slug)+'/quote',{items:lines})
     if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('The basket could not be safely reviewed.')
     setQuote(result)
   }catch(e){setQuoteError(e instanceof Error?e.message:'Current prices could not be verified. Refresh and try again.')}
   finally{setQuoteLoading(false)}
 }
 const load=useCallback(async()=>{
   setLoading(true)
   try {
     const result=await api.get<Detail>('/marketplace/stores/'+encodeURIComponent(slug))
     setData(result);setError('')
   }catch(e){
     setData(null);setError(e instanceof ApiClientError?e.message:'Store could not be loaded.')
   }finally{setLoading(false)}
 },[slug])
 useEffect(()=>{setBasket({});setQuote(null);setQuoteError('');void load()},[load,user?.id])

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

 async function submitProduct(){
   if(!data||busy)return
   setBusy(true)
   try{
     const variants=variantLines.split(/\r?\n/).filter(s=>s.trim()).map(line=>{
       const bits=line.split('|').map(s=>s.trim())
       if(bits.length!==3)throw new Error('Variants must follow: Name | SKU | Price in ₵')
       return {title:bits[0],sku:bits[1],priceMinor:toMinor(bits[2]),optionValues:{}}
     })
     const specifications:Record<string,string>={}
     for(const line of specs.split(/\r?\n/).filter(s=>s.trim())){
       const i=line.indexOf(':')
       if(i<2)throw new Error('Enter each specification as Field: Value')
       specifications[line.slice(0,i).trim()]=line.slice(i+1).trim()
     }
     const productSlug=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
       .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'')
     await api.post('/marketplace/stores/'+encodeURIComponent(slug)+'/products',{
       name,slug:productSlug,shortDesc:description.slice(0,180),description,
       brand,category,productKind:'GOODS',
       specifications,images:images.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
       variants,
     })
     await load()
     setProductOpen(false)
     setName('');setDescription('');setSpecs('');setImages('');setVariantLines('')
     toast({title:'Product draft created',description:'Receive stock and publish the product when ready.'})
   }catch(e){
     toast({title:'Could not create product',description:e instanceof Error?e.message:'Check the form.',variant:'destructive'})
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

 async function adjustStock(){
   if(!stockVariant||busy)return
   const amount=Number(delta)
   if(!Number.isSafeInteger(amount)||amount===0){
     toast({title:'Enter a nonzero whole-number stock change',variant:'destructive'})
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
     toast({title:'Stock was not changed',description:e instanceof ApiClientError?e.message:'Try again.',variant:'destructive'})
   }finally{setBusy(false)}
 }

 if(loading&&!data)return <div className="mx-auto max-w-6xl px-4 py-16"><Loader2 className="mx-auto size-8 animate-spin text-primary"/><p className="mt-3 text-center text-muted-foreground">Loading storefront…</p></div>
 if(!data)return <div className="mx-auto max-w-xl px-4 py-24 text-center">
  <ShieldAlert className="mx-auto size-12 text-muted-foreground"/><h1 className="mt-3 text-xl font-bold">Store unavailable</h1>
  <p className="mt-2 text-sm text-muted-foreground">{error||'This store may be private or unavailable.'}</p>
  <Button className="mt-5" onClick={()=>navigate('/shop')}>Return to marketplace</Button>
 </div>
 return <div className="pb-14">
  <div className="relative h-44 overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-slate-900 sm:h-56">
    {data.store.coverUrl&&<img src={data.store.coverUrl} alt="" className="h-full w-full object-cover opacity-65"/>}
    <button type="button" onClick={()=>navigate('/shop')} className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"><ArrowLeft className="size-4"/>Marketplace</button>
  </div>
  <div className="mx-auto max-w-7xl space-y-8 px-4">
    <div className="-mt-8 relative flex flex-wrap items-start gap-4">
      {data.store.logoUrl?<img src={data.store.logoUrl} alt="" className="size-20 rounded-2xl border-4 border-background bg-white object-contain shadow-xl"/>:
        <div className="grid size-20 place-items-center rounded-2xl border-4 border-background bg-primary text-white shadow-xl"><Store className="size-8"/></div>}
      <div className="min-w-0 flex-1 pt-5">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold sm:text-3xl">{data.store.name}</h1>
          {data.store.verificationState==='VERIFIED'&&<Badge variant="secondary" className="gap-1"><BadgeCheck className="size-3"/>Verified</Badge>}
          {data.canManage&&<Badge variant="outline">{data.store.status}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{data.store.tagline||data.store.category}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Globe className="size-3.5"/>{[data.store.city,data.store.country].filter(Boolean).join(', ')} <span>·</span> {data.store.category}</p>
      </div>
      {data.canManage&&<div className="flex flex-wrap gap-2 pt-5">
        <Button variant="outline" onClick={()=>navigate('/seller')}>Seller studio</Button>
        <Button disabled={busy} onClick={()=>void setStoreStatus(data.store.status==='ACTIVE'?'DRAFT':'ACTIVE')}>
          {data.store.status==='ACTIVE'?'Unpublish store':'Publish store'}
        </Button>
      </div>}
    </div>
    {data.store.description&&<p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{data.store.description}</p>}
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-extrabold sm:text-2xl">Product catalogue</h2>
          <p className="mt-1 text-sm text-muted-foreground">Detailed goods, seller-defined variants and current available stock.</p>
        </div>
        {data.canManage&&<Button onClick={()=>{setCategory(data.store.category);setProductOpen(true)}}><Plus className="mr-2 size-4"/>Add product</Button>}
      </div>
      {data.products.length?<div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.products.map(product=><Card key={product.id} className="overflow-hidden rounded-2xl border-border/70">
          <div className="grid h-44 place-items-center bg-gradient-to-br from-muted via-background to-muted">
            {product.images[0]?<img src={product.images[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover"/>:<Package className="size-11 text-primary/40"/>}
          </div>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{product.category}</Badge>{data.canManage&&<Badge variant="outline">{product.status}</Badge>}</div>
            <h3 className="line-clamp-2 text-base font-extrabold">{product.name}</h3>
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            {Object.keys(product.specifications).length>0&&<div className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
              {Object.entries(product.specifications).slice(0,8).map(([k,v])=><div className="flex gap-2" key={k}><span className="min-w-0 flex-1 text-muted-foreground">{k}</span><span className="min-w-0 flex-1 text-right font-semibold">{v}</span></div>)}
            </div>}
            <div className="space-y-2">
              {product.variants.map(v=><div key={v.id} className="rounded-xl border bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{v.title}</span><span className="text-base font-extrabold text-primary">{price(v.priceMinor)}</span></div>
                <p className="mt-1 text-muted-foreground">SKU: {v.sku} · Available: {v.available}</p>
                {!data.canManage&&<div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{v.available>0?'Select quantity':'Unavailable'}</span>
                  <div className="flex items-center gap-2" role="group" aria-label={`${product.name}, ${v.title}, quantity`}>
                    <Button type="button" size="sm" variant="outline" className="size-9 p-0" disabled={!basket[v.id]||quoteLoading}
                      onClick={()=>selectQty(v.id,(basket[v.id]??0)-1,v.available)} aria-label={`Remove one ${v.title}`}>−</Button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">{basket[v.id]??0}</span>
                    <Button type="button" size="sm" variant="outline" className="size-9 p-0"
                      disabled={v.available<=0||(basket[v.id]??0)>=Math.min(v.available,20)||quoteLoading}
                      onClick={()=>selectQty(v.id,(basket[v.id]??0)+1,v.available)} aria-label={`Add one ${v.title}`}>+</Button>
                  </div>
                </div>}
                {data.canManage&&<Button size="sm" variant="outline" className="mt-2 w-full" onClick={()=>{setStockVariant(v);setDelta('10');setReason('New stock received from supplier')}}>Adjust inventory</Button>}
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
        <Button disabled={!lines.length||quoteLoading} onClick={()=>void reviewBasket()}>
          {quoteLoading?<Loader2 className="mr-2 size-4 animate-spin"/>:<CheckCircle2 className="mr-2 size-4"/>}
          {quoteLoading?'Checking catalogue…':'Check prices & stock'}
        </Button>
      </div>
      {quoteError&&<div role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{quoteError}</div>}
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
    <p className="rounded-xl border bg-muted/30 p-4 text-xs leading-6 text-muted-foreground">
      <CheckCircle2 className="mr-1 inline size-4 text-primary"/> Product listings show seller-provided descriptions and inventory. Platform checkout, order delivery and refunds are not yet enabled for independent stores. Unverified sellers are not represented as verified.
    </p>
  </div>
  <Dialog open={productOpen} onOpenChange={setProductOpen}>
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl">
      <DialogHeader><DialogTitle>Add a new product</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label htmlFor="product-name">Product name</Label><Input id="product-name" maxLength={150} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Handwoven Kente cloth"/></div>
        <div><Label htmlFor="product-category">Category</Label><Input id="product-category" maxLength={90} value={category} onChange={e=>setCategory(e.target.value)}/></div>
        <div><Label htmlFor="product-brand">Brand or manufacturer (optional)</Label><Input id="product-brand" maxLength={100} value={brand} onChange={e=>setBrand(e.target.value)}/></div>
        <div><Label htmlFor="product-description">Full description</Label><Textarea id="product-description" rows={5} maxLength={8000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Materials, size, care, origin, condition and other product details"/></div>
        <div><Label htmlFor="product-specs">Specifications (one per line: Field: Value)</Label><Textarea id="product-specs" rows={4} value={specs} onChange={e=>setSpecs(e.target.value)} placeholder={'Material: Cotton\nLength cm: 250'}/></div>
        <div><Label htmlFor="product-images">Product image URLs (HTTPS, one per line)</Label><Textarea id="product-images" rows={3} value={images} onChange={e=>setImages(e.target.value)} placeholder="https://your-store.com/product.jpg"/></div>
        <div><Label htmlFor="product-variants">Variants: Label | SKU | Price in ₵ (one per line)</Label><Textarea id="product-variants" rows={4} value={variantLines} onChange={e=>setVariantLines(e.target.value)} placeholder={'Large | KENTE-L | 350.00\nMedium | KENTE-M | 290.00'}/></div>
        <p className="text-xs text-muted-foreground">Prices are stored in integer minor units, not floating-point currency. Inventory starts at zero and must be received separately.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={()=>setProductOpen(false)} disabled={busy}>Cancel</Button><Button disabled={busy||name.trim().length<3||description.trim().length<15} onClick={()=>void submitProduct()}>{busy&&<Loader2 className="mr-1 size-4 animate-spin"/>}Create draft</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <Dialog open={stockVariant!==null} onOpenChange={open=>{if(!open)setStockVariant(null)}}>
    <DialogContent className="rounded-2xl">
      <DialogHeader><DialogTitle>Adjust physical inventory</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Variant: <strong>{stockVariant?.sku}</strong>. Use a positive number to receive goods or a negative number to record an authorized stock reduction.</p>
      <div><Label htmlFor="stock-delta">Quantity change</Label><Input id="stock-delta" inputMode="numeric" value={delta} onChange={e=>setDelta(e.target.value)}/></div>
      <div><Label htmlFor="stock-reason">Reason for this inventory movement</Label><Textarea id="stock-reason" value={reason} maxLength={200} onChange={e=>setReason(e.target.value)}/></div>
      <DialogFooter><Button variant="outline" onClick={()=>setStockVariant(null)} disabled={busy}>Cancel</Button><Button disabled={busy||!reason.trim()} onClick={()=>void adjustStock()}>Record adjustment</Button></DialogFooter>
    </DialogContent>
  </Dialog>
 </div>
}
