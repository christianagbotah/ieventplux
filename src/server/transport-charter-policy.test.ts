import {test,expect} from 'bun:test'
import {parseCharterPlan,charterCapacityEstimate} from './transport-charter-policy'
const now=new Date('2026-11-25T12:00:00Z')
const draft={requestKey:'charter-1234567890',title:'Group excursion',originAreaId:'accra',destinationAreaId:'kumasi',departureAt:'2026-12-01T06:00:00.000Z',returnAt:'2026-12-02T16:00:00.000Z',passengers:75}
test('bounded Ghana journey plan, no booking or provider fields',()=>{
 expect(parseCharterPlan(draft,now).passengers).toBe(75)
 for(const patch of [{passengers:0},{passengers:1001},{passengers:1.5},{departureAt:'2026-11-25T12:00:00.000Z'},{returnAt:'2026-11-30T06:00:00.000Z'},{departureAt:'2026-11-31T06:00:00.000Z'},{providerId:'p1'},{state:'BOOKED'}])expect(()=>parseCharterPlan({...draft,...patch},now)).toThrow()
})
test('capacity estimates are arithmetic only',()=>{
 expect(charterCapacityEstimate(75)).toEqual([{illustrativeSeats:15,vehicles:5},{illustrativeSeats:30,vehicles:3},{illustrativeSeats:50,vehicles:2}])
 expect(()=>charterCapacityEstimate(0)).toThrow()
})
