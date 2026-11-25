import {test,expect} from 'bun:test'
import {parseAppointment,appointmentDecision} from './service-appointment-policy'
const now=new Date('2026-11-25T12:00:00Z')
const draft={enquiryId:'q1',startsAt:'2026-11-25T14:00:00.000Z',durationMinutes:60}
test('appointment accepts bounded explicit UTC slot only',()=>{
 expect(parseAppointment(draft,now).endsAt.toISOString()).toBe('2026-11-25T15:00:00.000Z')
 for(const patch of [{startsAt:'2026-11-25T12:15:00.000Z'},{startsAt:'2027-01-01T12:00:00.000Z'},{startsAt:'2026-11-31T14:00:00.000Z'},{durationMinutes:10},{durationMinutes:500},{durationMinutes:17},{status:'CONFIRMED'}])expect(()=>parseAppointment({...draft,...patch},now)).toThrow()
})
test('only provider confirms; participants can cancel future appointments',()=>{
 const row={status:'REQUESTED',startsAt:new Date(draft.startsAt)}
 expect(appointmentDecision('PROVIDER',row,{action:'CONFIRM'},now)).toBe('CONFIRMED')
 expect(()=>appointmentDecision('CUSTOMER',row,{action:'CONFIRM'},now)).toThrow()
 expect(()=>appointmentDecision('PROVIDER',row,{action:'CONFIRM'},row.startsAt)).toThrow()
 expect(appointmentDecision('CUSTOMER',{...row,status:'CONFIRMED'},{action:'CANCEL'},now)).toBe('CANCELLED')
 expect(()=>appointmentDecision('CUSTOMER',{...row,status:'DECLINED'},{action:'CANCEL'},now)).toThrow()
})
