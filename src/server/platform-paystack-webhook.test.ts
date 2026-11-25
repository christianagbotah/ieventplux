import {expect,test} from 'bun:test'
import {createHmac} from 'node:crypto'
import {verifyPaystackWebhook,parseSandboxChargeNotification} from './platform-paystack-webhook'
const now=1800000000,key='whsec_synthetic_test',kid='whk_test'
const data={event:'charge.success',data:{domain:'test',status:'success',id:123,reference:'TEST-abc',amount:10000,currency:'GHS'}}
const raw=Buffer.from(JSON.stringify(data))
const sign=(t:number,body=raw)=>createHmac('sha512',key).update(t+'.').update(body).digest('hex')
test('modern signature verifies raw bytes and supports rotation',()=>{
 expect(verifyPaystackWebhook(raw,'t='+now+',v1=whk_old:'+('0'.repeat(128))+',v1='+kid+':'+sign(now),{[kid]:key},now)).toBe(true)
 expect(verifyPaystackWebhook(Buffer.from('tampered'),'t='+now+',v1='+kid+':'+sign(now),{[kid]:key},now)).toBe(false)
})
test('reject stale future duplicate timestamps and wrong key IDs',()=>{
 for(const t of [now-301,now+301])expect(verifyPaystackWebhook(raw,'t='+t+',v1='+kid+':'+sign(t),{[kid]:key},now)).toBe(false)
 expect(verifyPaystackWebhook(raw,'t='+now+',t='+now+',v1='+kid+':'+sign(now),{[kid]:key},now)).toBe(false)
 expect(verifyPaystackWebhook(raw,'t='+now+',v1=whk_other:'+sign(now),{[kid]:key},now)).toBe(false)
})
test('charge notification identity is stable across delivery formatting',()=>{
 const e=parseSandboxChargeNotification(raw)
 expect(e.dedupKey).toBe(parseSandboxChargeNotification(Buffer.from(JSON.stringify(data,null,2))).dedupKey)
 expect(e.amountMinor).toBe(10000)
 for(const patch of [{domain:'live'},{amount:0},{currency:'NGN'},{status:'pending'},{id:-1}])expect(()=>parseSandboxChargeNotification(Buffer.from(JSON.stringify({...data,data:{...data.data,...patch}})))).toThrow()
})
