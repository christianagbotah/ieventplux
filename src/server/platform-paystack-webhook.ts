import {createHmac,timingSafeEqual,createHash} from 'node:crypto'
/** Modern test webhook signing, with explicit key IDs and a five-minute window.
 * No fallback to legacy signatures when the modern header is present. */
export function verifyPaystackWebhook(raw:Uint8Array,header:string,keys:Readonly<Record<string,string>>,now=Math.floor(Date.now()/1000)){
 if(raw.length>256_000||header.length>4096||!Number.isSafeInteger(now))return false
 let timestamp:string|undefined
 const signatures:{kid:string;hex:string}[]=[]
 for(const part of header.split(',')){
  const [name,...rest]=part.trim().split('=')
  const value=rest.join('=').trim()
  if(name==='t'){
   if(timestamp!==undefined||!/^\d{1,12}$/.test(value))return false
   timestamp=value
  }else if(name==='v1'){
   const m=/^(whk_[A-Za-z0-9_-]{1,100}):([a-f0-9]{128})$/.exec(value)
   if(m)signatures.push({kid:m[1],hex:m[2]})
  }
 }
 if(!timestamp||!signatures.length||Math.abs(now-Number(timestamp))>300)return false
 for(const {kid,hex} of signatures){
  if(!Object.prototype.hasOwnProperty.call(keys,kid))continue
  const key=keys[kid]
  if(typeof key!=='string'||!key.startsWith('whsec_')||key.length<10)continue
  const digest=createHmac('sha512',key).update(timestamp+'.').update(raw).digest()
  if(timingSafeEqual(digest,Buffer.from(hex,'hex')))return true
 }
 return false
}
export function parseSandboxChargeNotification(raw:Uint8Array){
 if(raw.length>256_000)throw new Error('Webhook too large.')
 const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))
 const d=body?.data
 if(body?.event!=='charge.success'||d?.domain!=='test'||d?.status!=='success'||typeof d.reference!=='string'||! /^[A-Za-z0-9.=-]{1,100}$/.test(d.reference)||d.currency!=='GHS'||!Number.isSafeInteger(d.amount)||d.amount<=0||d.amount>100_000_000||!Number.isSafeInteger(d.id)||d.id<=0)throw new Error('Unsupported or invalid sandbox notification.')
 return {reference:d.reference,amountMinor:d.amount,currency:'GHS' as const,providerTransactionId:String(d.id),dedupKey:createHash('sha256').update('PAYSTACK:test:charge.success:'+String(d.id)+':'+d.reference).digest('hex')}
}
