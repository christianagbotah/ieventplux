function object(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid request')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected fields')
 return x
}
function field(v:unknown,min:number,max:number){
 if(typeof v!=='string')throw new Error('Invalid text')
 const t=v.trim()
 if(t.length<min||t.length>max||/[\u0000-\u001f\u007f]/.test(t))throw new Error('Invalid text')
 return t
}
export function parseEnquiry(raw:unknown){
 const x=object(raw,['providerId','requestKey','description','community'])
 const providerId=field(x.providerId,1,100),requestKey=field(x.requestKey,16,100)
 if(!/^[A-Za-z0-9_-]+$/.test(providerId)||!/^[A-Za-z0-9_-]+$/.test(requestKey))throw new Error('Invalid identifier')
 return {providerId,requestKey,description:field(x.description,10,1000),community:field(x.community,2,100)}
}
export function enquiryDecision(role:'CUSTOMER'|'PROVIDER',row:{status:string;quoteExpiresAt:Date|null},raw:unknown,now:Date){
 const action=(raw as {action?:unknown}|null)?.action
 if(action==='QUOTE'){
  const x=object(raw,['action','quoteMinor','quoteNote'])
  if(role!=='PROVIDER'||row.status!=='REQUESTED'||typeof x.quoteMinor!=='number'||!Number.isSafeInteger(x.quoteMinor)||x.quoteMinor<1||x.quoteMinor>100000000)throw new Error('Quote unavailable or invalid amount')
  return {status:'QUOTED',quoteMinor:x.quoteMinor,quoteNote:field(x.quoteNote,2,500),quoteExpiresAt:new Date(now.getTime()+24*60*60*1000)}
 }
 object(raw,['action'])
 if(role==='PROVIDER'&&row.status==='REQUESTED'&&action==='DECLINE')return {status:'DECLINED'}
 if(role==='CUSTOMER'&&['REQUESTED','QUOTED'].includes(row.status)&&action==='WITHDRAW')return {status:'WITHDRAWN'}
 if(role==='CUSTOMER'&&row.status==='QUOTED'&&action==='DECLINE_QUOTE')return {status:'QUOTE_DECLINED'}
 if(role==='CUSTOMER'&&row.status==='QUOTED'&&action==='ACCEPT_QUOTE'&&row.quoteExpiresAt&&row.quoteExpiresAt>now)return {status:'QUOTE_ACCEPTED'}
 throw new Error('Decision unavailable or quote expired')
}
