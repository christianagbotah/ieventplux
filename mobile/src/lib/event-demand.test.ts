import {describe,expect,test} from 'bun:test'
import {allTicketsSoldOut,canJoinDemandWaitlist,demandDenied,eventDemandOpen,waitlistPartySize} from './event-demand'
describe('native event demand display',()=>{
 const now=Date.parse('2026-11-26T10:00:00Z')
 test('future published only',()=>{
  expect(eventDemandOpen('PUBLISHED','2026-11-27T10:00:00Z',now)).toBe(true)
  for(const status of ['DRAFT','SCHEDULED','LIVE','CANCELLED','ENDED','POSTPONED'])expect(eventDemandOpen(status,'2026-11-27T10:00:00Z',now)).toBe(false)
  expect(eventDemandOpen('PUBLISHED','bad',now)).toBe(false)
  expect(eventDemandOpen('PUBLISHED','2026-11-26T10:00:00Z',now)).toBe(false)
 })
 test('all active inventory must be exhausted, not empty or unlimited',()=>{
  const sold={active:true,quota:3,soldCount:2,reservedCount:1}
  expect(allTicketsSoldOut([sold])).toBe(true)
  expect(allTicketsSoldOut([sold,{...sold,quota:0}])).toBe(false)
  expect(allTicketsSoldOut([sold,{...sold,reservedCount:0}])).toBe(false)
  expect(allTicketsSoldOut([sold,{...sold,active:false,quota:0}])).toBe(true)
  expect(allTicketsSoldOut([])).toBe(false)
 })
 test('only eligible states can join or rejoin',()=>{
  const base={open:true,soldOut:true}
  for(const status of [null,'LEFT','NOTIFIED'])expect(canJoinDemandWaitlist({...base,status})).toBe(true)
  for(const status of ['WAITING','CONVERTED'])expect(canJoinDemandWaitlist({...base,status})).toBe(false)
  expect(canJoinDemandWaitlist({...base,open:false})).toBe(false)
  expect(canJoinDemandWaitlist({...base,soldOut:false})).toBe(false)
 })
 test('validate party bounds and do not mislabel transport errors as access denial',()=>{
  for(const v of ['','0','11','1.5','-1','abc'])expect(waitlistPartySize(v)).toBeNull()
  expect(waitlistPartySize('1')).toBe(1);expect(waitlistPartySize('10')).toBe(10)
  for(const code of [401,403,404])expect(demandDenied(code)).toBe(true)
  for(const code of [0,429,500])expect(demandDenied(code)).toBe(false)
 })
})
