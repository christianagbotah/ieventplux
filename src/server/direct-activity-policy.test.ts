import {expect,test} from 'bun:test'
import {activityWindow,parseActivity} from './direct-activity-policy'
test('activity expires, typing expires sooner, no composer text is persisted',()=>{
 const now=new Date(0)
 expect(activityWindow(now,true)).toEqual({activeUntil:new Date(20000),typingUntil:new Date(8000)})
 expect(activityWindow(now,false).typingUntil).toBeNull()
 expect(parseActivity({share:true,typing:true,body:'private text'})).toEqual({share:true,typing:true})
 expect(parseActivity({share:false,typing:true})).toBeNull()
 expect(parseActivity({share:'true',typing:false})).toBeNull()
})
