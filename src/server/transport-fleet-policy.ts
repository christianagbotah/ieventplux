/** Inventory limits for a private pilot, not statutory seating authorization.
 * Certified capacity must eventually come from vehicle-specific evidence. */
export const TRANSPORT_CLASSES=[
 {id:'TAXI_CAR',min:1,max:6,categories:['TAXI']},
 {id:'MINIBUS',min:1,max:30,categories:['TROTRO','BUS_CHARTER']},
 {id:'COACH',min:1,max:100,categories:['BUS_CHARTER']},
 {id:'MOTORCYCLE',min:1,max:1,categories:['MOTORCYCLE_TRANSPORT']},
 {id:'TRICYCLE',min:1,max:4,categories:['TRICYCLE_TRANSPORT']},
 {id:'RENTAL_CAR',min:1,max:15,categories:['VEHICLE_RENTAL']},
 {id:'TOW_TRUCK',min:0,max:0,categories:['TOWING']},
] as const
export function vehicleClasses(category:string){return TRANSPORT_CLASSES.filter(c=>c.categories.some(x=>x===category))}
export function parseVehicle(category:string,raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid vehicle')
 const x=raw as Record<string,unknown>
 const keys=['label','vehicleClass','passengerSeats','stationAreaId']
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected vehicle fields')
 const cls=vehicleClasses(category).find(c=>c.id===x.vehicleClass)
 const label=typeof x.label==='string'?x.label.trim().replace(/ +/g,' '):''
 if(!cls||label.length<2||label.length>80||/[\u0000-\u001f\u007f]/.test(label)||typeof x.passengerSeats!=='number'||!Number.isInteger(x.passengerSeats)||x.passengerSeats<cls.min||x.passengerSeats>cls.max||!(x.stationAreaId===null||typeof x.stationAreaId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x.stationAreaId)))throw new Error('Choose an applicable vehicle class, label and declared seats')
 return {label,labelKey:label.toLocaleLowerCase('en'),vehicleClass:cls.id,passengerSeats:x.passengerSeats,stationAreaId:x.stationAreaId as string|null}
}
export function parseFleetAction(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {action?:unknown}).action!=='ARCHIVE')throw new Error('Only archival is available')
 return 'ARCHIVED' as const
}
