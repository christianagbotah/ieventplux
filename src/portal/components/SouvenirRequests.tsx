'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
import {money} from '../format'
type Product={id:string;name:string;priceMinor:number;available:number}
type Item={id:string;productName:string;productSku:string;quantity:number;totalMinor:number;status:string}
type History={items:Item[];manager:boolean}
export function SouvenirRequests({eventId,products=[],allowCreate=false}:{eventId:string;products?:Product[];allowCreate?:boolean}){
 const path='/events/'+encodeURIComponent(eventId)+'/souvenir-requests'
 const [data,setData]=useState<History|null>(null)
 const [productId,setProductId]=useState('')
 const [quantity,setQuantity]=useState(1)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const retry=useRef(new Map<string,string>())
 const load=useCallback(async()=>{try{setData(await api.get<History>(path))}catch(e){setError(e instanceof Error?e.message:'Requests unavailable.')}},[path])
 useEffect(()=>{void load()},[load])
 const product=products.find(p=>p.id===productId)
 async function submit(){
  if(!product)return
  const key=JSON.stringify([product.id,quantity,product.priceMinor])
  if(!retry.current.has(key))retry.current.set(key,crypto.randomUUID())
  setBusy(true);setError('');setNotice('')
  try{await api.post(path,{productId:product.id,quantity,expectedUnitPriceMinor:product.priceMinor,requestKey:retry.current.get(key)});retry.current.delete(key);setNotice('Request sent. No payment or stock reservation has been made.');setProductId('');setQuantity(1);await load()}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}
 }
 async function decide(id:string,status:string){
  setBusy(true);setError('');setNotice('')
  try{await api.patch(path+'/'+encodeURIComponent(id),{status});await load()}catch(e){setError(e instanceof Error?e.message:'Unable to update request.')}finally{setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">{data?.manager?'Incoming merchandise requests':'Merchandise requests'}</h3><p className="text-sm text-muted-foreground">Requests are not confirmed orders. No money is collected or stock reserved.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
 {allowCreate&&data&&!data.manager&&<><div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Product<select className="block h-11 w-full rounded-md border bg-background px-2" value={productId} disabled={busy} onChange={e=>{setProductId(e.target.value);setQuantity(1)}}><option value="">Choose product</option>{products.filter(p=>p.available>0).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.priceMinor)}</option>)}</select></label>
 {product&&<label className="text-sm">Quantity<select className="block h-11 w-full rounded-md border bg-background px-2" value={quantity} disabled={busy} onChange={e=>setQuantity(Number(e.target.value))}>{Array.from({length:Math.min(20,product.available)},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>}</div>{product&&<p className="text-sm font-semibold">Reviewed total: {money(product.priceMinor*quantity)}</p>}<Button disabled={busy||!product} onClick={()=>void submit()}>Send purchase request</Button></>}
 {data?.items.map(i=><article key={i.id} className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-semibold">{i.productName} · {i.productSku}</p><p>{i.quantity} × item · {money(i.totalMinor)}</p><p>{i.status.toLowerCase()} · not a paid order</p><div className="flex flex-wrap gap-2">{data.manager&&i.status==='REQUESTED'&&<Button size="sm" disabled={busy} onClick={()=>void decide(i.id,'ACKNOWLEDGED')}>Acknowledge</Button>}{['REQUESTED','ACKNOWLEDGED'].includes(i.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void decide(i.id,data.manager?'DECLINED':'WITHDRAWN')}>{data.manager?'Decline':'Withdraw'}</Button>}</div></article>)}
 {data?.items.length===0&&<p className="text-sm text-muted-foreground">No requests yet.</p>}
 </section>
}
