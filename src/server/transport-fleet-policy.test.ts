import {test,expect} from 'bun:test'
import {parseVehicle,vehicleClasses,parseFleetAction} from './transport-fleet-policy'
const draft={label:'  Fleet   01  ',vehicleClass:'TAXI_CAR',passengerSeats:4,stationAreaId:null}
test('private inventory only, strict category and capacity',()=>{
 expect(parseVehicle('TAXI',draft)).toEqual({label:'Fleet 01',labelKey:'fleet 01',vehicleClass:'TAXI_CAR',passengerSeats:4,stationAreaId:null})
 expect(vehicleClasses('BUS_CHARTER').map(x=>x.id)).toEqual(['MINIBUS','COACH'])
 for(const patch of [{passengerSeats:7},{passengerSeats:1.5},{vehicleClass:'COACH'},{state:'ACTIVE'},{certified:true},{ownerId:'another'},{stationAreaId:'../private'}])expect(()=>parseVehicle('TAXI',{...draft,...patch})).toThrow()
 expect(()=>parseVehicle('CARPENTRY',draft)).toThrow()
})
test('no self activation or publication',()=>{
 expect(parseFleetAction({action:'ARCHIVE'})).toBe('ARCHIVED')
 for(const raw of [{action:'ACTIVATE'},{action:'CERTIFY'},{action:'ARCHIVE',dispatchEnabled:true}])expect(()=>parseFleetAction(raw)).toThrow()
})
