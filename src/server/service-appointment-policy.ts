function object(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid request')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected fields')
 return x
}
export function parseAppointment(raw:unknown,now:Date){
 const x=object(raw,['enquiryId','startsAt','durationMinutes'])
 if(typeof x.enquiryId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x.enquiryId)||typeof x.startsAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(x.startsAt)||typeof x.durationMinutes!=='number'||!Number.isInteger(x.durationMinutes)||x.durationMinutes<15||x.durationMinutes>480||x.durationMinutes%15!==0)throw new Error('Invalid appointment time or duration')
 const startsAt=new Date(x.startsAt)
 if(!Number.isFinite(startsAt.getTime())||startsAt.toISOString()!==x.startsAt||startsAt.getTime()<now.getTime()+30*60000||startsAt.getTime()>now.getTime()+30*86400000)throw new Error('Choose a time 30 minutes to 30 days ahead')
 return {enquiryId:x.enquiryId,startsAt,endsAt:new Date(startsAt.getTime()+x.durationMinutes*60000)}
}
export function appointmentDecision(role:'CUSTOMER'|'PROVIDER',row:{status:string;startsAt:Date},raw:unknown,now:Date){
 const x=object(raw,['action'])
 if(x.action==='CONFIRM'&&role==='PROVIDER'&&row.status==='REQUESTED'&&row.startsAt>now)return 'CONFIRMED'
 if(x.action==='DECLINE'&&role==='PROVIDER'&&row.status==='REQUESTED')return 'DECLINED'
 if(x.action==='CANCEL'&&['REQUESTED','CONFIRMED'].includes(row.status)&&row.startsAt>now)return 'CANCELLED'
 throw new Error('Appointment decision unavailable')
}
