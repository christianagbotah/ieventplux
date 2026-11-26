import {createHash} from 'node:crypto'
export function deviceManagementId(keyHash:string,activatedAt:Date){
 return createHash('sha256').update(JSON.stringify(['push-management-v1',keyHash,activatedAt.toISOString()])).digest('hex')
}
export function validManagementId(id:unknown):id is string{
 return typeof id==='string'&&/^[0-9a-f]{64}$/.test(id)
}
type Device={keyHash:string;activatedAt:Date;platform:string;updatedAt:Date;leaseUntil:Date|null;sessionId:string}
export function publicPushDevice(row:Device,currentSessionId:string,now:Date){
 return {id:deviceManagementId(row.keyHash,row.activatedAt),platform:row.platform,lastUpdatedAt:row.updatedAt,leaseUntil:row.leaseUntil,currentSession:row.sessionId===currentSessionId,registrationCurrent:!!row.leaseUntil&&row.leaseUntil>now}
}
