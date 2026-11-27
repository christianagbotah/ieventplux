import {expect,test} from 'bun:test'
import {BLANK_EVENT_DRAFT,canManageNativeEvent,parseDeviceLocalDateTime,newEventDraftPayload,editEventDraftPayload,validateEventDraft} from './organizer-event-form'

test('native editor roles mirror server event:create and event:edit permission set',()=>{
  for (const role of ['OWNER','ADMIN','EVENT_MANAGER']) expect(canManageNativeEvent(role)).toBe(true)
  for (const role of ['FINANCE','CHECKIN_STAFF','ANALYST','USER','']) expect(canManageNativeEvent(role)).toBe(false)
})
test('strict local date parser rejects non-calendar dates and malformed times',()=>{
  expect(parseDeviceLocalDateTime('2026-02-30','12:00')).toBeNull()
  expect(parseDeviceLocalDateTime('2026-11-24','24:01')).toBeNull()
  expect(parseDeviceLocalDateTime('2026-11-24','10:60')).toBeNull()
  expect(parseDeviceLocalDateTime('2026-12-01','10:15')?.getMinutes()).toBe(15)
})
test('draft creation requires future end after start, and writes a DRAFT only via backend',()=>{
  const f={...BLANK_EVENT_DRAFT,title:'Community gathering', startDate:'2099-10-11',startTime:'12:00',endDate:'2099-10-11',endTime:'13:00'}
  expect(validateEventDraft(f)).toBeNull()
  const payload=newEventDraftPayload('accepted-org',f)
  expect(payload.orgId).toBe('accepted-org')
  expect(new Date(payload.startsAt).getTime()).toBeLessThan(new Date(payload.endsAt).getTime())
  expect('status' in payload).toBe(false)
  expect(validateEventDraft({...f,endTime:'11:00'})).toContain('end after')
  expect(validateEventDraft({...f,title:'x'})).toContain('title')
})
test('edit form does not change event dates, publication status or visibility',()=>{
  const payload=editEventDraftPayload({...BLANK_EVENT_DRAFT,title:'Updated event',visibility:'INVITE_ONLY'})
  expect(payload.title).toBe('Updated event')
  expect('startsAt' in payload).toBe(false)
  expect('status' in payload).toBe(false)
  expect('visibility' in payload).toBe(false)
})

test('native recurrence sends a bounded number of extra drafts',()=>{
 const f={...BLANK_EVENT_DRAFT,title:'Weekly gathering',startDate:'2099-10-11',startTime:'12:00',endDate:'2099-10-11',endTime:'13:00',repeatWeeks:'4'}
 expect(validateEventDraft(f)).toBeNull()
 expect(newEventDraftPayload('org',f).repeatWeeks).toBe(4)
 expect(validateEventDraft({...f,repeatWeeks:'27'})).toContain('0–26')
 expect(validateEventDraft({...f,repeatWeeks:'1.5'})).toContain('0–26')
 expect('repeatWeeks' in editEventDraftPayload(f)).toBe(false)
})
