import {expect,test} from 'bun:test'
import {invitationPilotEnabled,nextCallState} from './direct-call-policy'
const call={status:'RINGING',callerId:'a',calleeId:'b',callerSessionId:'a1',acceptedSessionId:null,expiresAt:new Date(1000)}
test('pilot is isolated from production',()=>{
 expect(invitationPilotEnabled({})).toBe(false)
 expect(invitationPilotEnabled({CI:'true',NODE_ENV:'production',IEVENTPLUX_DIRECT_CALL_TEST_MODE:'yes'})).toBe(false)
 expect(invitationPilotEnabled({CI:'true',NODE_ENV:'test',IEVENTPLUX_DIRECT_CALL_TEST_MODE:'yes'})).toBe(true)
})
test('call actions are participant and device scoped, expired calls cannot be accepted',()=>{
 expect(nextCallState(call,'a','a1','accept',new Date(0))).toBeNull()
 expect(nextCallState(call,'b','b1','accept',new Date(0))).toBe('ACCEPTED')
 expect(nextCallState(call,'c','c1','accept',new Date(0))).toBeNull()
 expect(nextCallState(call,'a','a2','cancel',new Date(0))).toBeNull()
 expect(nextCallState(call,'a','a1','cancel',new Date(0))).toBe('CANCELLED')
 expect(nextCallState(call,'b','b1','accept',new Date(1000))).toBeNull()
 const accepted={...call,status:'ACCEPTED',acceptedSessionId:'b1'}
 expect(nextCallState(accepted,'b','b2','end',new Date(0))).toBeNull()
 expect(nextCallState(accepted,'b','b1','end',new Date(0))).toBe('ENDED')
})
