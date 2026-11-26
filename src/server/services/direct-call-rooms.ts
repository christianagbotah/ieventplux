import {RoomServiceClient} from 'livekit-server-sdk'
import {Prisma} from '@prisma/client'
import {db} from '../../lib/db'
import {callMediaTestEnabled} from '../direct-call-media'
import {reconcileDirectRooms,type RoomProvider,type RoomEntitlement} from '../direct-call-room-policy'
/** Dedicated loopback test service only. Never share an event meeting SFU,
 * accept an externally supplied URL, or fall back to production credentials. */
export function isolatedCallRoomProvider(env:Record<string,string|undefined>):RoomProvider|null{
 if(!callMediaTestEnabled(env)||env.IEVENTPLUX_DIRECT_CALL_ROOM_TEST_MODE!=='yes')return null
 const client=new RoomServiceClient('http://127.0.0.1:17880','devkey','secret')
 return {
  listRooms:()=>client.listRooms(),
  listParticipants:room=>client.listParticipants(room),
  removeParticipant:(room,identity)=>client.removeParticipant(room,identity),
  deleteRoom:room=>client.deleteRoom(room),
 }
}
export async function resolveDirectRoomEntitlement(id:string):Promise<RoomEntitlement|null>{
 return db.$transaction(async tx=>{
  const c=await tx.directCall.findUnique({where:{id},include:{conversation:{select:{status:true,participantLowId:true,participantHighId:true}}}})
  if(!c)return null
  const state={id:c.id,status:c.status,kind:c.kind,callerId:c.callerId,calleeId:c.calleeId,callerSessionId:c.callerSessionId,acceptedSessionId:c.acceptedSessionId,expiresAt:c.expiresAt}
  const now=new Date()
  if(c.status!=='ACCEPTED'||c.expiresAt<=now||!c.acceptedSessionId||c.conversation.status!=='ACCEPTED'||c.callerId===c.calleeId||![c.conversation.participantLowId,c.conversation.participantHighId].includes(c.callerId)||![c.conversation.participantLowId,c.conversation.participantHighId].includes(c.calleeId))return {...state,authorized:false}
  const [users,sessions,slots,block]=await Promise.all([
   tx.user.count({where:{id:{in:[c.callerId,c.calleeId]},status:'ACTIVE',deletedAt:null}}),
   tx.session.count({where:{revokedAt:null,expiresAt:{gt:now},OR:[{id:c.callerSessionId,userId:c.callerId},{id:c.acceptedSessionId,userId:c.calleeId}]}}),
   tx.directCallSlot.count({where:{callId:id,userId:{in:[c.callerId,c.calleeId]}}}),
   tx.userBlock.findFirst({where:{OR:[{blockerId:c.callerId,blockedId:c.calleeId},{blockerId:c.calleeId,blockedId:c.callerId}]},select:{blockerId:true}}),
  ])
  return {...state,authorized:users===2&&sessions===2&&slots===2&&!block}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
let cursor:string|null=null
export async function sweepIsolatedDirectCallRooms(){
 const provider=isolatedCallRoomProvider(process.env)
 if(!provider)return null
 const result=await reconcileDirectRooms(provider,resolveDirectRoomEntitlement,cursor)
 cursor=result.nextCursor
 return result
}
