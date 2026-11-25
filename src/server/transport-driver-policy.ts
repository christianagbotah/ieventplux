import {createHash,randomBytes} from 'node:crypto'
export function newDriverInvitation(now:Date){
 const token=randomBytes(24).toString('base64url')
 return {token,inviteHash:hashDriverInvitation(token),expiresAt:new Date(now.getTime()+30*60000)}
}
export function hashDriverInvitation(token:unknown){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))throw new Error('Invalid invitation')
 return createHash('sha256').update(token).digest('hex')
}
export function parseDriverAcceptance(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==2)throw new Error('Invitation and consent required')
 const x=raw as Record<string,unknown>
 if(x.consent!==true)throw new Error('Explicit consent required')
 return hashDriverInvitation(x.token)
}
export function mayAcceptDriverInvitation(row:{state:string;driverId:string|null;expiresAt:Date},now:Date){
 return row.state==='INVITED'&&row.driverId===null&&row.expiresAt>now
}
