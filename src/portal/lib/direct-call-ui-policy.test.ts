import {expect,test} from 'bun:test'
import {callDeadline,callSeconds,callStatusFresh,showIncomingForThread} from './direct-call-ui-policy'
test('countdown uses server time, expires safely, and clamps invalid leases',()=>{
 const base=Date.parse('2026-11-26T10:00:00Z')
 expect(callDeadline(new Date(base+45000).toISOString(),new Date(base).toISOString(),5000)).toBe(50000)
 expect(callDeadline(new Date(base+1000000).toISOString(),new Date(base).toISOString(),5000)).toBe(125000)
 expect(callDeadline('invalid',undefined,5000)).toBe(0)
 expect(callSeconds(50000,49999)).toBe(1)
 expect(callSeconds(50000,50001)).toBe(0)
 expect(callStatusFresh(5000,20001)).toBe(false)
 expect(callStatusFresh(5000,20000)).toBe(true)
})
test('incoming dialog is suppressed only in its own chat or immersive view',()=>{
 expect(showIncomingForThread(true,'a','b')).toBe(true)
 expect(showIncomingForThread(true,'a','a')).toBe(false)
 expect(showIncomingForThread(true,undefined,'a')).toBe(true)
 expect(showIncomingForThread(false,'a','b')).toBe(false)
})
