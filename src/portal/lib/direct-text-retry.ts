import {usePortal} from '../store'
import {validPendingText,type PendingText} from './direct-text-retry-policy'
let pending:PendingText|null=null
usePortal.subscribe((state,previous)=>{if(state.user?.id!==previous.user?.id)pending=null})
export function readTextRetry(owner:string){
 if(usePortal.getState().user?.id!==owner)return null
 pending=validPendingText(pending,owner)
 return pending
}
export function saveTextRetry(record:PendingText){
 if(usePortal.getState().user?.id!==record.owner)return false
 const old=readTextRetry(record.owner)
 if(old&&old.key!==record.key)return false
 pending=record
 return true
}
export function clearTextRetry(owner:string,key:string){
 if(pending?.owner===owner&&pending.key===key)pending=null
}
