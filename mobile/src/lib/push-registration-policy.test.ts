import {expect,test} from 'bun:test'
import {readPushState,shouldRefreshPush,projectIdFrom,hasFreshPushLease} from './push-registration-policy'
test('only the opted-in current account is refreshed',()=>{
 const state=readPushState('{"ownerId":"a","desired":true,"registered":false}')
 expect(shouldRefreshPush(state,'a')).toBe(true)
 expect(shouldRefreshPush(state,'b')).toBe(false)
 expect(shouldRefreshPush({...state!,desired:false},'a')).toBe(false)
 expect(readPushState('{"ownerId":"a","desired":"true"}')).toBeNull()
 expect(readPushState('null')).toBeNull()
})
test('missing or placeholder project identity is not a provider configuration',()=>{
 expect(projectIdFrom(undefined)).toBeNull()
 expect(projectIdFrom('placeholder')).toBeNull()
 expect(projectIdFrom('12345678-1234-1234-1234-123456789abc')).toBe('12345678-1234-1234-1234-123456789abc')
})

test('legacy or expired registrations are not shown as current',()=>{
 const s={ownerId:'a',desired:true,registered:true,leaseUntil:new Date(10000).toISOString()}
 expect(hasFreshPushLease(s,'a',9999)).toBe(true)
 expect(hasFreshPushLease(s,'a',10000)).toBe(false)
 expect(hasFreshPushLease(s,'b',9999)).toBe(false)
 expect(hasFreshPushLease({...s,leaseUntil:undefined},'a',9999)).toBe(false)
})
