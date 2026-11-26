import {expect,test} from 'bun:test'
import {readPushState,shouldRefreshPush,projectIdFrom} from './push-registration-policy'
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
