import {expect,test} from 'bun:test'
import {pendingRecord,pendingChunks,MAX_PENDING_AGE} from './direct-pending-policy'
const value={userId:'a',conversationId:'b',body:'😀'.repeat(2000),key:'client_key_123456789',createdAt:1000}
test('pending text is account and conversation scoped, bounded and expiring',()=>{
 expect(pendingRecord(value,'a','b',1000)).toEqual(value)
 expect(pendingRecord(value,'other','b',1000)).toBeNull()
 expect(pendingRecord(value,'a','other',1000)).toBeNull()
 expect(pendingRecord(value,'a','b',1001+MAX_PENDING_AGE)).toBeNull()
 expect(pendingRecord({...value,body:'x'.repeat(4001)},'a','b',1000)).toBeNull()
 const chunks=pendingChunks(value)
 expect(JSON.parse(chunks.join(''))).toEqual(value)
 expect(chunks.every(c=>Array.from(c).length<=400)).toBe(true)
})
