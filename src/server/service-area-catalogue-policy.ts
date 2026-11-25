export const GHANA_REGIONS=['Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North'] as const
function exact(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid input')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected fields')
 return x
}
export function parseServiceArea(raw:unknown){
 const x=exact(raw,['name','region','latitude','longitude','attested'])
 const name=typeof x.name==='string'?x.name.trim().replace(/ +/g,' '):''
 if(name.length<2||name.length>100||/[\u0000-\u001f\u007f]/.test(name)||!GHANA_REGIONS.some(r=>r===x.region)||x.attested!==true||typeof x.latitude!=='number'||!Number.isFinite(x.latitude)||x.latitude<4||x.latitude>12||typeof x.longitude!=='number'||!Number.isFinite(x.longitude)||x.longitude< -4||x.longitude>2)throw new Error('Reviewed Ghana community anchor required')
 // Store only a coarse centroid (roughly one kilometre), not a private address.
 return {country:'GH',region:x.region as string,name,latitude:Math.round(x.latitude*100)/100,longitude:Math.round(x.longitude*100)/100}
}
export function parseAreaConsent(raw:unknown){
 const x=exact(raw,['areaId','consent'])
 if(x.consent!==true||typeof x.areaId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x.areaId))throw new Error('Explicit service-area consent required')
 return {areaId:x.areaId}
}
