import {expect,test} from 'bun:test'
import {classifyTicket,classifyReceipt,genericEnvelope,optedIn,pushTransportConfigured} from './push-delivery-policy'
test('push remains disabled without both explicit flag and access token',()=>{
 expect(pushTransportConfigured({})).toBe(false)
 expect(pushTransportConfigured({IEVENTPLUX_PUSH_DELIVERY_ENABLED:'true'})).toBe(false)
 expect(pushTransportConfigured({IEVENTPLUX_PUSH_DELIVERY_ENABLED:'false',EXPO_PUSH_ACCESS_TOKEN:'synthetic'})).toBe(false)
 expect(pushTransportConfigured({IEVENTPLUX_PUSH_DELIVERY_ENABLED:'true',EXPO_PUSH_ACCESS_TOKEN:'synthetic'})).toBe(true)
 expect(optedIn('{"push":true}')).toBe(true)
 for(const raw of ['{}','null','bad','{"push":false}','{"push":"true"}'])expect(optedIn(raw)).toBe(false)
})
test('lock-screen payload is generic and has no user, notification or route data',()=>{
 const payload=genericEnvelope('synthetic-token')
 expect(Object.keys(payload).sort()).toEqual(['body','channelId','data','priority','title','to','ttl'])
 expect(payload.body).toBe('You have new activity. Open iEventPlux to view it.')
 expect(payload.data).toEqual({kind:'activity'})
})
test('provider acceptance is distinct from provider receipt',()=>{
 expect(classifyTicket(200,{data:[{status:'ok',id:'synthetic-ticket'}]})).toEqual({kind:'accepted',ticketId:'synthetic-ticket'})
 expect(classifyTicket(429,{})).toEqual({kind:'retry',code:'RATE_LIMIT'})
 expect(classifyTicket(503,{}).kind).toBe('unknown')
 expect(classifyTicket(200,{data:[]}).kind).toBe('unknown')
 expect(classifyTicket(200,{data:[{status:'error',message:'secret token',details:{error:'MessageRateExceeded'}}]})).toEqual({kind:'retry',code:'MessageRateExceeded'})
 expect(classifyReceipt({status:'error',message:'secret token',details:{error:'DeviceNotRegistered'}})).toEqual({kind:'failed',code:'DeviceNotRegistered'})
 expect(classifyReceipt({status:'error',message:'secret token',details:{error:'arbitrary'}})).toEqual({kind:'failed',code:'PROVIDER_REJECTED'})
 expect(classifyReceipt(undefined)).toEqual({kind:'pending'})
 expect(classifyReceipt({status:'ok'})).toEqual({kind:'ok'})
})
