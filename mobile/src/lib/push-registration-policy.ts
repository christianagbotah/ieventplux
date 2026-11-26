export type LocalPushState = { ownerId: string; desired: boolean; registered: boolean; leaseUntil?:string }
export function readPushState(raw:string|null):LocalPushState|null {
 if(!raw)return null
 try{
  const value=JSON.parse(raw) as Partial<LocalPushState>
  if(typeof value.ownerId!=='string'||!value.ownerId||typeof value.desired!=='boolean'||typeof value.registered!=='boolean')return null
  return {ownerId:value.ownerId,desired:value.desired,registered:value.registered,...(typeof value.leaseUntil==='string'&&Number.isFinite(Date.parse(value.leaseUntil))?{leaseUntil:value.leaseUntil}:{})}
 }catch{return null}
}
export function shouldRefreshPush(state:LocalPushState|null,userId:string):boolean{
 return !!state&&state.ownerId===userId&&state.desired
}
export function projectIdFrom(raw:unknown):string|null{
 return typeof raw==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)?raw:null
}

export function hasFreshPushLease(state:LocalPushState|null,userId:string,now=Date.now()){
 return !!state&&state.ownerId===userId&&state.desired&&state.registered&&!!state.leaseUntil&&Date.parse(state.leaseUntil)>now
}
