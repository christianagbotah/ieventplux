import {expect,test} from 'bun:test'
import {validPendingText,safeJournalSize,MAX_RETRY_AGE} from './direct-text-retry-policy'
const now=1700000000000
const record={owner:'owner1',conversationId:'chat1',key:'1234567890abcdef',body:'A private test message',createdAt:now}
test('retry record is account-bound, time bounded and validates identity',()=>{
 expect(validPendingText(record,'owner1',now)).toEqual(record)
 expect(validPendingText(record,'owner2',now)).toBeNull()
 expect(validPendingText({...record,conversationId:'../bad'},'owner1',now)).toBeNull()
 expect(validPendingText({...record,key:'short'},'owner1',now)).toBeNull()
 expect(validPendingText({...record,body:' '},'owner1',now)).toBeNull()
 expect(validPendingText(record,'owner1',now+MAX_RETRY_AGE+1)).toBeNull()
 expect(validPendingText({...record,createdAt:now+61000},'owner1',now)).toBeNull()
})
test('only small records can enter the secure journal',()=>{
 expect(safeJournalSize(record)).toBe(true)
 expect(safeJournalSize({...record,body:'a'.repeat(4000)})).toBe(false)
 expect(safeJournalSize({...record,body:'🙂'.repeat(500)})).toBe(false)
})
