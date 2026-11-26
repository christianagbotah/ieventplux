import {expect,test} from 'bun:test'
import {createHmac} from 'node:crypto'
import {callMediaFixture,callMediaAdmission,callRoomName,callMediaIdentity,signDirectCallMedia} from './direct-call-media'
const env={CI:'true',NODE_ENV:'test',IEVENTPLUX_DIRECT_CALL_TEST_MODE:'yes',IEVENTPLUX_DIRECT_CALL_MEDIA_TEST_MODE:'yes'}
const call={id:'call-1234',status:'ACCEPTED',kind:'VOICE',callerId:'a',calleeId:'b',callerSessionId:'a1',acceptedSessionId:'b1',expiresAt:new Date(60000)}
const a={userId:'a',sessionId:'a1'},b={userId:'b',sessionId:'b1'}
test('synthetic media fixture is separately gated and never production-enabled',()=>{
 expect(callMediaFixture({})).toBeNull()
 expect(callMediaFixture({...env,NODE_ENV:'production'})).toBeNull()
 expect(callMediaFixture({...env,IEVENTPLUX_DIRECT_CALL_MEDIA_TEST_MODE:'no'})).toBeNull()
 expect(callMediaFixture(env)?.serverUrl).toBe('wss://direct-call-media.example.invalid')
})
test('admission is scoped to accepted invitation and exact session',()=>{
 const now=new Date(0)
 expect(callMediaAdmission({...call,status:'RINGING'},a,now)).toBeNull()
 expect(callMediaAdmission(call,{...a,sessionId:'other'},now)).toBeNull()
 expect(callMediaAdmission(call,{...b,sessionId:'other'},now)).toBeNull()
 expect(callMediaAdmission(call,{userId:'c',sessionId:'c1'},now)).toBeNull()
 expect(callMediaAdmission(call,a,new Date(56000))).toBeNull()
 expect(callMediaAdmission(call,a,new Date(50000))?.seconds).toBe(10)
 expect(callMediaAdmission(call,a,now)?.seconds).toBe(20)
 expect(callMediaIdentity(call.id,a)).not.toBe(callMediaIdentity(call.id,b))
 expect(callRoomName(call.id)).toBe('ieventplux-direct-call-1234')
 expect(()=>callRoomName('../bad')).toThrow()
})
test('JWT is signed, room restricted, no administration/data grants',async()=>{
 const config=callMediaFixture(env)!
 for(const kind of ['VOICE','VIDEO']){
  const admission=callMediaAdmission({...call,kind},a,new Date(0))!
  const result=await signDirectCallMedia(config,admission)
  const [header,payload,signature]=result.token.split('.')
  expect(signature).toBe(createHmac('sha256',config.secret).update(header+'.'+payload).digest('base64url'))
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))
  expect(claims.sub).toBe(admission.identity)
  expect(claims.video.room).toBe(admission.room)
  expect(claims.video.roomJoin).toBe(true)
  expect(claims.video.canPublishData).toBe(false)
  expect(claims.video.roomAdmin).not.toBe(true)
  expect(claims.video.roomCreate).not.toBe(true)
  expect(claims.video.canPublishSources).toHaveLength(kind==='VOICE'?1:2)
  expect(claims.exp-claims.nbf).toBeLessThanOrEqual(20)
 }
})
