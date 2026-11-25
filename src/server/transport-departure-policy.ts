export function parseDeparture(raw:unknown,now:Date){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid departure')
 const x=raw as Record<string,unknown>,keys=['routeId','vehicleId','date','allocatedSeats']
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected fields')
 const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)
 if(!id(x.routeId)||!id(x.vehicleId)||typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||typeof x.allocatedSeats!=='number'||!Number.isInteger(x.allocatedSeats)||x.allocatedSeats<1||x.allocatedSeats>100)throw new Error('Choose route, vehicle, date and seats')
 const day=new Date(x.date+'T00:00:00.000Z')
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==x.date||day.getTime()<Math.floor(now.getTime()/86400000)*86400000||day.getTime()>now.getTime()+90*86400000)throw new Error('Choose a date within 90 days')
 return {routeId:x.routeId,vehicleId:x.vehicleId,day,allocatedSeats:x.allocatedSeats}
}
export function planDeparture(input:ReturnType<typeof parseDeparture>,route:{state:string;departureMinute:number;operatingDays:number[];estimatedMinutes:number},vehicle:{state:string;passengerSeats:number},now:Date){
 if(route.state!=='DRAFT'||vehicle.state!=='DRAFT'||input.allocatedSeats>vehicle.passengerSeats)throw new Error('Active private route and sufficient declared seats required')
 const weekday=input.day.getUTCDay()||7
 if(!route.operatingDays.includes(weekday))throw new Error('Route does not operate on that weekday')
 const departureAt=new Date(input.day.getTime()+route.departureMinute*60000)
 if(departureAt.getTime()<now.getTime()+30*60000)throw new Error('Departure must be at least 30 minutes ahead')
 return {departureAt,arrivalAt:new Date(departureAt.getTime()+route.estimatedMinutes*60000)}
}
