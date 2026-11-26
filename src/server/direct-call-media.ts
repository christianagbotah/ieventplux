import {createHash} from 'node:crypto'
import {AccessToken,TrackSource} from 'livekit-server-sdk'
import {invitationPilotEnabled,type CallKind} from './direct-call-policy'

export const CALL_MEDIA_TOKEN_MAX_SECONDS=20
export type CallMediaConfig={key:string;secret:string;serverUrl:string}
type Admission={id:string;kind:string;status:string;callerId:string;calleeId:string;callerSessionId:string;acceptedSessionId:string|null;expiresAt:Date}
type Actor={userId:string;sessionId:string}
export function callMediaTestEnabled(env:Record<string,string|undefined>){
 return invitationPilotEnabled(env)&&env.IEVENTPLUX_DIRECT_CALL_MEDIA_TEST_MODE==='yes'
}
export function callMediaFixture(env:Record<string,string|undefined>):CallMediaConfig|null{
 // Synthetic signing only. Never issue credentials for a real media server
 // until room cleanup, reconnect/revocation and provider acceptance are ready.
 return callMediaTestEnabled(env)?{key:'ievx-ci-direct-call-fixture',secret:'ci-only-direct-call-media-not-a-production-key',serverUrl:'wss://direct-call-media.example.invalid'}:null
}
export function callRoomName(id:string){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('Invalid call identifier.')
 return 'ieventplux-direct-'+id
}
export function callMediaIdentity(callId:string,actor:Actor){
 return 'direct-'+createHash('sha256').update(JSON.stringify([callId,actor.userId,actor.sessionId])).digest('hex')
}
export function callMediaAdmission(call:Admission,actor:Actor,now:Date){
 if(call.status!=='ACCEPTED'||!['VOICE','VIDEO'].includes(call.kind)||!call.acceptedSessionId)return null
 if(!((call.callerId===actor.userId&&call.callerSessionId===actor.sessionId)||(call.calleeId===actor.userId&&call.acceptedSessionId===actor.sessionId)))return null
 const seconds=Math.min(CALL_MEDIA_TOKEN_MAX_SECONDS,Math.floor((+call.expiresAt-+now)/1000))
 if(seconds<5)return null
 return {room:callRoomName(call.id),identity:callMediaIdentity(call.id,actor),seconds,kind:call.kind as CallKind}
}
export async function signDirectCallMedia(config:CallMediaConfig,admission:NonNullable<ReturnType<typeof callMediaAdmission>>){
 const token=new AccessToken(config.key,config.secret,{identity:admission.identity,ttl:admission.seconds+'s'})
 token.addGrant({roomJoin:true,room:admission.room,canSubscribe:true,canPublish:true,canPublishSources:admission.kind==='VIDEO'?[TrackSource.MICROPHONE,TrackSource.CAMERA]:[TrackSource.MICROPHONE],canPublishData:false,roomAdmin:false,roomCreate:false,roomList:false})
 return {token:await token.toJwt(),serverUrl:config.serverUrl,expiresIn:admission.seconds}
}
