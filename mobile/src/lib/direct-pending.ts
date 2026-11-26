import * as SecureStore from 'expo-secure-store'
import {pendingRecord,pendingChunks,type PendingText} from './direct-pending-policy'
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}
function slot(userId:string,conversationId:string){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(userId)||!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId))throw new Error('Invalid pending message scope.')
 return 'ievx.direct.pending.'+userId+'.'+conversationId
}
let queue:Promise<unknown>=Promise.resolve()
function serial<T>(fn:()=>Promise<T>){const result=queue.then(fn,fn);queue=result.catch(()=>{});return result}
async function remove(base:string,count:number){
 if(count)await SecureStore.setItemAsync(base,'clear:'+count,options)
 for(let i=0;i<count;i++)await SecureStore.deleteItemAsync(base+'.'+i,options)
 await SecureStore.deleteItemAsync(base,options)
}
async function manifest(base:string){
 const raw=await SecureStore.getItemAsync(base,options)
 if(raw===null)return 0
 const interrupted=/^(?:write|clear):([0-9]+)$/.exec(raw)
 if(interrupted){const count=Number(interrupted[1]);if(count<1||count>64)throw new Error('Pending message storage is unreadable.');await remove(base,count);return 0}
 const count=Number(raw)
 if(!Number.isInteger(count)||count<1||count>64)throw new Error('Pending message storage is unreadable.')
 return count
}
export function loadPendingText(userId:string,conversationId:string){
 return serial(async()=>{
  const base=slot(userId,conversationId),count=await manifest(base)
  if(!count)return null
  const parts:string[]=[]
  for(let i=0;i<count;i++){const part=await SecureStore.getItemAsync(base+'.'+i,options);if(part===null)throw new Error('Pending message storage is incomplete.');parts.push(part)}
  let value:unknown
  try{value=JSON.parse(parts.join(''))}catch{throw new Error('Pending message storage is unreadable.')}
  const record=pendingRecord(value,userId,conversationId)
  if(!record)await remove(base,count)
  return record
 })
}
export function savePendingText(record:PendingText){
 return serial(async()=>{
  const base=slot(record.userId,record.conversationId)
  if(await manifest(base))throw new Error('A pending message already exists. Reopen the conversation to restore it.')
  const chunks=pendingChunks(record)
  let written=0
  try{
   await SecureStore.setItemAsync(base,'write:'+chunks.length,options)
   for(const chunk of chunks){await SecureStore.setItemAsync(base+'.'+written,chunk,options);written++}
   // Publish the manifest only after all chunks are stored.
   await SecureStore.setItemAsync(base,String(chunks.length),options)
  }catch(err){await remove(base,chunks.length).catch(()=>{});throw err}
 })
}
export function clearPendingText(userId:string,conversationId:string){
 return serial(async()=>{const base=slot(userId,conversationId);await remove(base,await manifest(base))})
}
