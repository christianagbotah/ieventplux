import {expect,test} from 'bun:test'
import {canonicalPair,parseDirectMessage,mayDecide,validDirectId} from './direct-message-policy'
test('pair order is independent of requester',()=>expect(canonicalPair('b','a')).toEqual(canonicalPair('a','b')))
test('message validation and stable client key',()=>{
 const clientKey='unique_client_key_123'
 expect(parseDirectMessage({body:'  hello\nworld  ',clientKey})).toEqual({body:'hello\nworld',clientKey})
 for(const body of ['', ' '.repeat(20), 'a'.repeat(4001), 'hello\u0000'])expect(parseDirectMessage({body,clientKey})).toBeNull()
 expect(parseDirectMessage({body:'hello',clientKey:'short'})).toBeNull()
 expect(validDirectId('../other')).toBe(false)
})
test('only recipient decides pending contact',()=>{
 expect(mayDecide('PENDING','a','b')).toBe(true)
 expect(mayDecide('PENDING','a','a')).toBe(false)
 expect(mayDecide('DECLINED','a','b')).toBe(false)
})
