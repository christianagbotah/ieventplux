import {expect,test} from 'bun:test'
import {deviceManagementId,publicPushDevice,validManagementId} from './push-device-management'
test('management selector is separate from registration capability and tied to activation',()=>{
 const row={keyHash:'a'.repeat(64),activatedAt:new Date(1000),platform:'ANDROID',updatedAt:new Date(2000),leaseUntil:new Date(3000),sessionId:'session'}
 const result=publicPushDevice(row,'session',new Date(2500))
 expect(validManagementId(result.id)).toBe(true)
 expect(result.id).not.toBe(row.keyHash)
 expect(result.id).not.toBe(deviceManagementId(row.keyHash,new Date(1001)))
 expect(result.currentSession).toBe(true)
 expect(result.registrationCurrent).toBe(true)
 expect(publicPushDevice(row,'other',new Date(3000)).registrationCurrent).toBe(false)
 expect(publicPushDevice(row,'other',new Date(2000)).currentSession).toBe(false)
 expect(Object.keys(result).sort()).toEqual(['currentSession','id','lastUpdatedAt','leaseUntil','platform','registrationCurrent'].sort())
})
