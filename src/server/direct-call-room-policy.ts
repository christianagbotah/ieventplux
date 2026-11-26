import {callMediaIdentity} from './direct-call-media'
export const DIRECT_ROOM_PREFIX='ieventplux-direct-'
export type RoomEntitlement={id:string;status:string;kind:string;callerId:string;calleeId:string;callerSessionId:string;acceptedSessionId:string|null;expiresAt:Date;authorized:boolean}
export function directRoomCallId(name:string){
 if(!name.startsWith(DIRECT_ROOM_PREFIX))return null
 const id=name.slice(DIRECT_ROOM_PREFIX.length)
 return /^[A-Za-z0-9_-]{1,128}$/.test(id)?id:null
}
export function roomEntitlement(state:RoomEntitlement|null,now:Date){
 if(!state?.authorized||state.status!=='ACCEPTED'||state.expiresAt<=now||!state.acceptedSessionId||!['VOICE','VIDEO'].includes(state.kind)||state.callerId===state.calleeId)return null
 return new Set([callMediaIdentity(state.id,{userId:state.callerId,sessionId:state.callerSessionId}),callMediaIdentity(state.id,{userId:state.calleeId,sessionId:state.acceptedSessionId})])
}
export type RoomProvider={
 listRooms:()=>Promise<{name:string}[]>
 listParticipants:(room:string)=>Promise<{identity:string}[]>
 removeParticipant:(room:string,identity:string)=>Promise<unknown>
 deleteRoom:(room:string)=>Promise<unknown>
}
export type RoomReconcileResult={scanned:number;closed:number;evicted:number;bothPresent:number;failed:number;nextCursor:string|null}
/** Provider-authoritative observation, never trusts a client assertion that
 * both media participants have connected. Repeated sweeps close resurrected
 * rooms after terminal state, even after process restart. */
export async function reconcileDirectRooms(provider:RoomProvider,resolve:(id:string)=>Promise<RoomEntitlement|null>,cursor:string|null=null,limit=20,clock=()=>new Date()):Promise<RoomReconcileResult>{
 const names=[...new Set((await provider.listRooms()).map(r=>r.name).filter(name=>directRoomCallId(name)!==null))].sort()
 const batch=names.filter(name=>cursor===null||name>cursor).slice(0,Math.max(1,Math.min(50,Math.trunc(limit)||20)))
 const result:RoomReconcileResult={scanned:0,closed:0,evicted:0,bothPresent:0,failed:0,nextCursor:null}
 for(const room of batch){
  result.scanned++
  try{
   const callId=directRoomCallId(room)!
   const state=await resolve(callId)
   if(state&&state.id!==callId)throw new Error('Entitlement scope mismatch.')
   const allowed=roomEntitlement(state,clock())
   if(!allowed){await provider.deleteRoom(room);result.closed++;continue}
   const participants=await provider.listParticipants(room)
   // Recheck after the provider request: revocation or end may race the lookup.
   const refreshed=await resolve(callId)
   if(refreshed&&refreshed.id!==callId)throw new Error('Entitlement scope mismatch.')
   const latest=roomEntitlement(refreshed,clock())
   if(!latest){await provider.deleteRoom(room);result.closed++;continue}
   const seen=new Set<string>()
   for(const participant of participants){
    if(!latest.has(participant.identity)){await provider.removeParticipant(room,participant.identity);result.evicted++}
    else seen.add(participant.identity)
   }
   if(seen.size===2)result.bothPresent++
  }catch{result.failed++}
 }
 const last=batch.at(-1)
 result.nextCursor=last&&names.some(name=>name>last)?last:null
 return result
}
