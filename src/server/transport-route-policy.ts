const ROUTE_CATEGORIES=new Set(['TROTRO','BUS_CHARTER','TAXI','MOTORCYCLE_TRANSPORT','TRICYCLE_TRANSPORT'])
export function supportsRoutePlanning(category:string){return ROUTE_CATEGORIES.has(category)}
export function parseTransportRoute(category:string,raw:unknown){
 if(!supportsRoutePlanning(category)||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Route planning unavailable')
 const x=raw as Record<string,unknown>,keys=['label','originAreaId','destinationAreaId','departureTime','operatingDays','estimatedMinutes']
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected route fields')
 const label=typeof x.label==='string'?x.label.trim().replace(/ +/g,' '):''
 const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)
 if(label.length<2||label.length>80||/[\u0000-\u001f\u007f]/.test(label)||!id(x.originAreaId)||!id(x.destinationAreaId)||x.originAreaId===x.destinationAreaId)throw new Error('Choose a route label and distinct reviewed communities')
 if(typeof x.departureTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.departureTime))throw new Error('Use Ghana time HH:mm')
 const days=x.operatingDays
 if(!Array.isArray(days)||days.length<1||days.length>7||new Set(days).size!==days.length||days.some(v=>typeof v!=='number'||!Number.isInteger(v)||v<1||v>7))throw new Error('Choose operating weekdays')
 if(typeof x.estimatedMinutes!=='number'||!Number.isInteger(x.estimatedMinutes)||x.estimatedMinutes<5||x.estimatedMinutes>1440)throw new Error('Enter an estimated journey duration of 5–1440 minutes')
 const [h,m]=x.departureTime.split(':').map(Number)
 return {label,labelKey:label.toLocaleLowerCase('en'),originAreaId:x.originAreaId as string,destinationAreaId:x.destinationAreaId as string,departureMinute:h*60+m,operatingDays:[...days].sort((a,b)=>a-b) as number[],estimatedMinutes:x.estimatedMinutes}
}
