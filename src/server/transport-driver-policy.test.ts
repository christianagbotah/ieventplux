import {test,expect} from 'bun:test'
import {newDriverInvitation,hashDriverInvitation,parseDriverAcceptance,mayAcceptDriverInvitation} from './transport-driver-policy'
const now=new Date('2026-11-25T12:00:00Z')
test('invitation uses opaque random token, only hash is stored and consent is required',()=>{
 const invite=newDriverInvitation(now)
 expect(invite.token.length).toBe(32)
 expect(invite.inviteHash).toBe(hashDriverInvitation(invite.token))
 expect(invite.inviteHash).not.toContain(invite.token)
 expect(invite.token).not.toBe(newDriverInvitation(now).token)
 expect(parseDriverAcceptance({token:invite.token,consent:true})).toBe(invite.inviteHash)
 for(const raw of [{token:invite.token,consent:false},{token:invite.token,consent:true,driverId:'other'},{token:'bad',consent:true}])expect(()=>parseDriverAcceptance(raw)).toThrow()
})
test('expired, used or ended invitations cannot be accepted',()=>{
 const row={state:'INVITED',driverId:null,expiresAt:newDriverInvitation(now).expiresAt}
 expect(mayAcceptDriverInvitation(row,now)).toBe(true)
 expect(mayAcceptDriverInvitation(row,row.expiresAt)).toBe(false)
 expect(mayAcceptDriverInvitation({...row,state:'ACCEPTED',driverId:'u1'},now)).toBe(false)
 expect(mayAcceptDriverInvitation({...row,state:'ENDED'},now)).toBe(false)
})
