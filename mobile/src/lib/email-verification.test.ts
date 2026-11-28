import {expect,test} from 'bun:test'
import {verificationCode,resendWait,RESEND_WAIT_MS} from './email-verification'
test('native verification code input preserves zeros and bounds digits',()=>{expect(verificationCode(' 012-34567')).toBe('012345');expect(verificationCode('abc')).toBe('');expect(verificationCode('000001')).toBe('000001')})
test('resend countdown expires and rounds up',()=>{expect(resendWait(RESEND_WAIT_MS,0)).toBe(30);expect(resendWait(30000,29999)).toBe(1);expect(resendWait(30000,31000)).toBe(0)})
