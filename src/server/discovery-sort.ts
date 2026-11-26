/** Never compare raw minor units across currencies. */
export function parseDiscoverySort(sort:string|null,currency:string|null){
 if(!sort||sort==='upcoming')return {kind:'upcoming'} as const
 if(sort==='newest')return {kind:'newest'} as const
 if(sort==='price'&&currency&&/^[A-Z]{3}$/.test(currency))return {kind:'price',currency} as const
 return null
}
export function validDiscoveryDate(value:string|null){
 return value===null||(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)&&Number.isFinite(Date.parse(value)))
}
export function orderByIds<T extends {id:string}>(rows:T[],ids:string[]){
 const map=new Map(rows.map(row=>[row.id,row]))
 return ids.flatMap(id=>{const row=map.get(id);return row?[row]:[]})
}
