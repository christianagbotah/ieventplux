import {expect,test} from 'bun:test'
import {activityDestination,isActivityHint} from './push-activity-policy'
test('only generic activity marker opens current account inbox',()=>{
 expect(isActivityHint({kind:'activity'})).toBe(true)
 expect(isActivityHint({kind:'activity',url:'https://example.invalid',userId:'another-account'})).toBe(true)
 expect(isActivityHint({url:'https://example.invalid'})).toBe(false)
 expect(isActivityHint(null)).toBe(false)
 expect(activityDestination(true)).toBe('Notifications')
 expect(activityDestination(false)).toBe('Login')
})
