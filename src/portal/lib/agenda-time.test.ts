import { describe,expect,test } from 'bun:test'
import { agendaLocalToUtc,agendaUtcToLocal,agendaFormError } from './agenda-time'
describe('Event agenda respects IANA event timezone, never browser-local by accident',()=>{
  test('Ghana local event time is UTC',()=>{
    expect(agendaLocalToUtc('2026-12-01T09:30','Africa/Accra')).toBe('2026-12-01T09:30:00.000Z')
    expect(agendaUtcToLocal('2026-12-01T09:30:00.000Z','Africa/Accra')).toBe('2026-12-01T09:30')
  })
  test('India preserves half-hour offset',()=>{
    expect(agendaLocalToUtc('2026-12-01T09:30','Asia/Kolkata')).toBe('2026-12-01T04:00:00.000Z')
  })
  test('NY winter versus summer have different UTC offsets',()=>{
    expect(agendaLocalToUtc('2026-01-15T10:00','America/New_York')).toBe('2026-01-15T15:00:00.000Z')
    expect(agendaLocalToUtc('2026-07-15T10:00','America/New_York')).toBe('2026-07-15T14:00:00.000Z')
  })
  test('ambiguous and skipped daylight saving times are not guessed',()=>{
    expect(()=>agendaLocalToUtc('2026-03-08T02:30','America/New_York')).toThrow('does not exist')
    expect(()=>agendaLocalToUtc('2026-11-01T01:30','America/New_York')).toThrow('twice')
  })
  test('invalid dates, bad zones, chronological errors rejected',()=>{
    expect(()=>agendaLocalToUtc('2026-02-30T09:00','Africa/Accra')).toThrow('valid')
    expect(()=>agendaLocalToUtc('2026-12-01T09:00','Not/Real')).toThrow('timezone')
    const form={title:'Opening',startsAt:'2026-12-01T10:00',endsAt:'2026-12-01T09:00',speaker:'',description:'',sortOrder:'0'}
    expect(agendaFormError(form,'Africa/Accra')).toContain('later')
    expect(agendaFormError({...form,endsAt:'2026-12-01T11:00'},'Africa/Accra')).toBeNull()
  })
})
