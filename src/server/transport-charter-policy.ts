function id(v:unknown){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))throw new Error('Invalid identifier');return v}
function utc(v:unknown){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(v))throw new Error('Use Ghana time with minute precision')
 const d=new Date(v)
 if(!Number.isFinite(d.getTime())||d.toISOString()!==v)throw new Error('Invalid date')
 return d
}
export function parseCharterPlan(raw:unknown,now:Date){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid plan')
 const x=raw as Record<string,unknown>,keys=['requestKey','title','originAreaId','destinationAreaId','departureAt','returnAt','passengers']
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected fields')
 const requestKey=id(x.requestKey),originAreaId=id(x.originAreaId),destinationAreaId=id(x.destinationAreaId)
 const title=typeof x.title==='string'?x.title.trim():''
 if(requestKey.length<16||title.length<2||title.length>100||/[\u0000-\u001f\u007f]/.test(title)||typeof x.passengers!=='number'||!Number.isInteger(x.passengers)||x.passengers<1||x.passengers>1000)throw new Error('Enter a title and 1–1000 passengers')
 const departureAt=utc(x.departureAt),returnAt=x.returnAt===null?null:utc(x.returnAt)
 if(departureAt.getTime()<now.getTime()+3600000||departureAt.getTime()>now.getTime()+365*86400000||returnAt&&(returnAt<=departureAt||returnAt.getTime()>departureAt.getTime()+30*86400000))throw new Error('Choose departure 1 hour to 365 days ahead and a valid return within 30 days')
 return {requestKey,title,originAreaId,destinationAreaId,departureAt,returnAt,passengers:x.passengers}
}
export function charterCapacityEstimate(passengers:number){
 if(!Number.isInteger(passengers)||passengers<1||passengers>1000)throw new Error('Invalid passenger count')
 return [15,30,50].map(seats=>({illustrativeSeats:seats,vehicles:Math.ceil(passengers/seats)}))
}
