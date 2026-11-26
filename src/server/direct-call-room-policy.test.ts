import {expect,test} from 'bun:test'
import {callMediaIdentity} from './direct-call-media'
import {directRoomCallId,reconcileDirectRooms,roomEntitlement,type RoomEntitlement,type RoomProvider} from './direct-call-room-policy'
const now=()=>new Date(1000)
const state=(id:string):RoomEntitlement=>({id,status:'ACCEPTED',kind:'VOICE',callerId:'a',calleeId:'b',callerSessionId:'a1',acceptedSessionId:'b1',expiresAt:new Date(2000),authorized:true})
test('room namespace is isolated and terminal, revoked, or expired state is never entitled',()=>{
 expect(directRoomCallId('ieventplux-meeting-x')).toBeNull()
 expect(directRoomCallId('ieventplux-direct-../x')).toBeNull()
 expect(directRoomCallId('ieventplux-direct-x')).toBe('x')
 expect(roomEntitlement({...state('x'),authorized:false},now())).toBeNull()
 expect(roomEntitlement({...state('x'),status:'ENDED'},now())).toBeNull()
 expect(roomEntitlement({...state('x'),expiresAt:now()},now())).toBeNull()
})
test('reconciliation closes orphan and ended rooms, evicts wrong devices, preserves meetings',async()=>{
 const closed:string[]=[],removed:string[]=[]
 const a=callMediaIdentity('live',{userId:'a',sessionId:'a1'}),b=callMediaIdentity('live',{userId:'b',sessionId:'b1'})
 const provider:RoomProvider={
  listRooms:async()=>['ieventplux-direct-live','ieventplux-direct-orphan','ieventplux-direct-ended','ieventplux-meeting-keep'].map(name=>({name})),
  listParticipants:async()=>[a,b,'wrong-device'].map(identity=>({identity})),
  removeParticipant:async(room,identity)=>{removed.push(room+':'+identity)},
  deleteRoom:async room=>{closed.push(room)},
 }
 const result=await reconcileDirectRooms(provider,async id=>id==='orphan'?null:id==='ended'?{...state(id),status:'ENDED'}:state(id),null,20,now)
 expect(result).toEqual({scanned:3,closed:2,evicted:1,bothPresent:1,failed:0,nextCursor:null})
 expect(closed).toEqual(['ieventplux-direct-ended','ieventplux-direct-orphan'])
 expect(removed).toEqual(['ieventplux-direct-live:wrong-device'])
})
test('revocation during provider lookup closes room rather than trusting stale snapshot',async()=>{
 let lookup=0,closed=0
 const provider:RoomProvider={listRooms:async()=>[{name:'ieventplux-direct-race'}],listParticipants:async()=>[],removeParticipant:async()=>{},deleteRoom:async()=>{closed++}}
 const result=await reconcileDirectRooms(provider,async id=>({...state(id),authorized:++lookup===1}),null,20,now)
 expect(closed).toBe(1);expect(result.bothPresent).toBe(0)
})
test('bounded cursor progresses past failed rooms and retries on subsequent cycle',async()=>{
 const provider:RoomProvider={listRooms:async()=>['a','b','c'].map(id=>({name:'ieventplux-direct-'+id})),listParticipants:async()=>[],removeParticipant:async()=>{},deleteRoom:async room=>{if(room.endsWith('-a'))throw new Error('test failure')}}
 const first=await reconcileDirectRooms(provider,async()=>null,null,1,now)
 expect(first.failed).toBe(1);expect(first.nextCursor).toBe('ieventplux-direct-a')
 const next=await reconcileDirectRooms(provider,async()=>null,first.nextCursor,2,now)
 expect(next.closed).toBe(2);expect(next.nextCursor).toBeNull()
})
