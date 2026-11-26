import * as SecureStore from 'expo-secure-store'
import {safeJournalSize,validPendingText,type PendingText} from './direct-text-retry-policy'
const SLOT='ieventplux_direct_text_retry_v1'
let owner:string|null=null
let memory:PendingText|null=null
let loaded=false
let generation=0
let chain=Promise.resolve()
function serial<T>(work:()=>Promise<T>):Promise<T>{
 const result=chain.then(work,work);chain=result.then(()=>{},()=>{});return result
}
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}
async function deleteSlot(){await SecureStore.deleteItemAsync(SLOT,options)}
export function setTextRetryOwner(next:string|null){
 if(next===owner){if(next===null)void serial(deleteSlot).catch(()=>{});return}
 const prior=owner
 owner=next;memory=null;loaded=false;generation++
 const rev=generation
 // At startup preserve a same-owner record; explicit logout always removes it.
 void serial(async()=>{
  if(next===null||prior!==null){await deleteSlot();return}
  if(rev!==generation)return
  const raw=await SecureStore.getItemAsync(SLOT,options)
  if(!raw)return
  let value:unknown
  try{value=JSON.parse(raw)}catch{value=null}
  if(!validPendingText(value,next))await deleteSlot()
 }).catch(()=>{})
}
export function readTextRetry(actor:string):Promise<PendingText|null>{
 return serial(async()=>{
  if(owner!==actor)return null
  const rev=generation
  if(!loaded){
   let raw:string|null=null
   try{raw=await SecureStore.getItemAsync(SLOT,options)}catch{}
   if(rev!==generation||owner!==actor)return null
   let value:unknown
   try{value=raw?JSON.parse(raw):null}catch{value=null}
   memory=validPendingText(value,actor);loaded=true
   if(raw&&!memory)await deleteSlot().catch(()=>{})
  }
  const record=validPendingText(memory,actor)
  if(memory&&!record){memory=null;await deleteSlot().catch(()=>{})}
  return owner===actor&&rev===generation?record:null
 })
}
export function saveTextRetry(record:PendingText):Promise<{saved:boolean;durable:boolean}>{
 return serial(async()=>{
  if(owner!==record.owner||!loaded||!validPendingText(record,record.owner))return {saved:false,durable:false}
  const rev=generation
  if(memory&&memory.key!==record.key)return {saved:false,durable:false}
  memory=record
  let durable=false
  try{
   if(safeJournalSize(record)){await SecureStore.setItemAsync(SLOT,JSON.stringify(record),options);durable=true}
   else await deleteSlot()
  }catch{}
  if(rev!==generation||owner!==record.owner)return {saved:false,durable:false}
  return {saved:true,durable}
 })
}
export function clearTextRetry(actor:string,key:string):Promise<void>{
 return serial(async()=>{
  if(owner!==actor||memory?.key!==key)return
  memory=null
  await deleteSlot().catch(()=>{})
 })
}
