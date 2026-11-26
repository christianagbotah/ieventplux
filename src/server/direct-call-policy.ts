export const RING_MS=45_000
export const ACCEPTED_INVITATION_MS=120_000
export type CallAction='accept'|'decline'|'cancel'|'end'
export type CallKind='VOICE'|'VIDEO'
type State={status:string;callerId:string;calleeId:string;callerSessionId:string;acceptedSessionId:string|null;expiresAt:Date}
export function invitationPilotEnabled(env:Record<string,string|undefined>){
 // Do not expose live invitations until media admission and UI are implemented.
 return env.CI==='true'&&env.NODE_ENV!=='production'&&env.IEVENTPLUX_DIRECT_CALL_TEST_MODE==='yes'
}
export function nextCallState(call:State,actorId:string,sessionId:string,action:CallAction,now:Date){
 if(actorId!==call.callerId&&actorId!==call.calleeId)return null
 if(call.expiresAt<=now)return null
 if(call.status==='RINGING'){
  if(action==='accept'&&actorId===call.calleeId)return 'ACCEPTED'
  if(action==='decline'&&actorId===call.calleeId)return 'DECLINED'
  if(action==='cancel'&&actorId===call.callerId&&sessionId===call.callerSessionId)return 'CANCELLED'
 }
 if(call.status==='ACCEPTED'&&action==='end'&&((actorId===call.callerId&&sessionId===call.callerSessionId)||(actorId===call.calleeId&&sessionId===call.acceptedSessionId)))return 'ENDED'
 return null
}
