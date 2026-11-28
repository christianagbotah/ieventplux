export const RESEND_WAIT_MS=30000
export function verificationCode(value:string){return value.replace(/\D/g,'').slice(0,6)}
export function resendWait(until:number,now=Date.now()){return Math.max(0,Math.ceil((until-now)/1000))}
