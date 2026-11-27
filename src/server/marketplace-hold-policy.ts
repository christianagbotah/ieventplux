import {parsePurchaseRequest} from './marketplace-request-policy'
export const MARKETPLACE_HOLD_MS=30*60*1000
export const MARKETPLACE_HOLD_SWEEP_LIMIT=50
/** Stored request snapshots are still validated, including all reviewed prices. */
export function heldSelections(row:{id:string;items:unknown;totalMinor:number;unitCount:number;currency:string}){
 if(row.currency!=='GHS'||!Array.isArray(row.items))throw new Error('Invalid purchase snapshot.')
 const parsed=parsePurchaseRequest({requestKey:'hold-'+row.id,expectedTotalMinor:row.totalMinor,items:row.items.map(x=>({variantId:x?.variantId,quantity:x?.quantity,expectedUnitPriceMinor:x?.unitPriceMinor}))})
 if(parsed.items.reduce((n,x)=>n+x.quantity,0)!==row.unitCount)throw new Error('Invalid purchase quantity.')
 return parsed
}
export function holdPilotEnabled(env:Record<string,string|undefined>){return env.IEVENTPLUX_MARKETPLACE_STOCK_HOLD_ENABLED==='true'}
