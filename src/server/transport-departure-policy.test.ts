import {test,expect} from 'bun:test'
import {parseDeparture,planDeparture} from './transport-departure-policy'
const now=new Date('2026-11-25T12:00:00Z')
const raw={routeId:'r1',vehicleId:'v1',date:'2026-11-26',allocatedSeats:20}
const route={state:'DRAFT',departureMinute:360,operatingDays:[4],estimatedMinutes:120}
const vehicle={state:'DRAFT',passengerSeats:30}
test('departure derives actual Ghana schedule and capacity from server records',()=>{
 const slot=planDeparture(parseDeparture(raw,now),route,vehicle,now)
 expect(slot.departureAt.toISOString()).toBe('2026-11-26T06:00:00.000Z')
 expect(slot.arrivalAt.toISOString()).toBe('2026-11-26T08:00:00.000Z')
})
test('blocks invalid dates, non-operating days, archived inventory and excessive seats',()=>{
 for(const patch of [{date:'2026-11-31'},{date:'2026-11-24'},{allocatedSeats:0},{allocatedSeats:1.5},{state:'CONFIRMED'},{passengerId:'u1'}])expect(()=>parseDeparture({...raw,...patch},now)).toThrow()
 const draft=parseDeparture(raw,now)
 expect(()=>planDeparture(draft,{...route,operatingDays:[1]},vehicle,now)).toThrow()
 expect(()=>planDeparture(draft,route,{...vehicle,passengerSeats:19},now)).toThrow()
 expect(()=>planDeparture(draft,route,{...vehicle,state:'ARCHIVED'},now)).toThrow()
})
