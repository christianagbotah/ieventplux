import {expect,test} from 'bun:test'
import {subscribeActivity,invalidateActivity} from './activity-signal'
test('activity invalidation is account scoped and unsubscribes',()=>{
 let a=0,b=0
 const offA=subscribeActivity('account-a',()=>a++)
 const offB=subscribeActivity('account-b',()=>b++)
 invalidateActivity('account-a')
 expect([a,b]).toEqual([1,0])
 offA()
 invalidateActivity('account-a')
 invalidateActivity('account-b')
 expect([a,b]).toEqual([1,1])
 offB()
})
