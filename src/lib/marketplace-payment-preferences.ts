import { MARKETPLACE_CATEGORIES } from './marketplace-options'
export type PaymentPreferences={mobileMoney:boolean;card:boolean;cash:boolean;destination:'BANK'|'MOMO'}
export const DEFAULT_PREFERENCES:PaymentPreferences={mobileMoney:false,card:false,cash:false,destination:'BANK'}
export class PaymentPreferencesError extends Error{}
export function parsePaymentPreferences(input:unknown):PaymentPreferences{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new PaymentPreferencesError('Payment preferences are required.')
 const x=input as Record<string,unknown>
 if(Object.keys(x).length!==4||Object.keys(x).some(k=>!['mobileMoney','card','cash','destination'].includes(k))||typeof x.mobileMoney!=='boolean'||typeof x.card!=='boolean'||typeof x.cash!=='boolean'||(x.destination!=='BANK'&&x.destination!=='MOMO'))throw new PaymentPreferencesError('Choose valid payment methods and a preferred settlement destination.')
 return {mobileMoney:x.mobileMoney,card:x.card,cash:x.cash,destination:x.destination}
}
export type CommissionRule={key:string;basisPoints:number}
export function commissionKeys(store:{id:string;category:string}):string[]{return ['store:'+store.id,'category:'+store.category,'global']}
export function effectiveCommission(rules:CommissionRule[],store:{id:string;category:string}):CommissionRule|null{
 for(const key of commissionKeys(store)){const rule=rules.find(r=>r.key===key);if(rule&&Number.isInteger(rule.basisPoints)&&rule.basisPoints>=0&&rule.basisPoints<=9999)return rule}
 return null
}
export function parseCommissionRule(input:unknown):{scope:'global'|'category'|'store';target:string;basisPoints:number|null}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new PaymentPreferencesError('Commission rule required.')
 const x=input as Record<string,unknown>
 if(Object.keys(x).length!==3||Object.keys(x).some(k=>!['scope','target','basisPoints'].includes(k)))throw new PaymentPreferencesError('Unexpected commission fields.')
 if(x.scope!=='global'&&x.scope!=='category'&&x.scope!=='store')throw new PaymentPreferencesError('Choose a commission scope.')
 if(typeof x.target!=='string'||(x.scope==='global'&&x.target!=='')||(x.scope==='category'&&!MARKETPLACE_CATEGORIES.some(c=>c===x.target))||(x.scope==='store'&&!/^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(x.target)))throw new PaymentPreferencesError('Choose a valid target.')
 if(x.basisPoints!==null&&(typeof x.basisPoints!=='number'||!Number.isInteger(x.basisPoints)||x.basisPoints<0||x.basisPoints>9999))throw new PaymentPreferencesError('Commission must be from 0 to 99.99 percent.')
 return {scope:x.scope,target:x.target,basisPoints:x.basisPoints}
}
