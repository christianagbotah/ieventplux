import {test,expect} from 'bun:test'
import {parseTransportRoute,supportsRoutePlanning} from './transport-route-policy'
const draft={label:'Morning service',originAreaId:'area-a',destinationAreaId:'area-b',departureTime:'06:30',operatingDays:[5,1,3],estimatedMinutes:90}
test('private route normalizes weekdays and Ghana departure time',()=>{
 expect(parseTransportRoute('TROTRO',draft)).toEqual({label:'Morning service',labelKey:'morning service',originAreaId:'area-a',destinationAreaId:'area-b',departureMinute:390,operatingDays:[1,3,5],estimatedMinutes:90})
 expect(supportsRoutePlanning('TOWING')).toBe(false)
})
test('invalid schedules and forged publication rejected',()=>{
 for(const patch of [{originAreaId:'area-b'},{departureTime:'24:00'},{departureTime:'06:60'},{operatingDays:[1,1]},{operatingDays:[0]},{operatingDays:[]},{estimatedMinutes:0},{estimatedMinutes:1441},{published:true},{fareMinor:1000}])expect(()=>parseTransportRoute('TROTRO',{...draft,...patch})).toThrow()
 expect(()=>parseTransportRoute('CARPENTRY',draft)).toThrow()
})
