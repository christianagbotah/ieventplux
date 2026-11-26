import {Platform} from 'react-native'
import Constants,{ExecutionEnvironment} from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import {api} from '../api/client'
import {projectIdFrom,readPushState,shouldRefreshPush,type LocalPushState} from './push-registration-policy'

const KEY='ieventplux.push.installation'
const STATE='ieventplux.push.preference'
let tail:Promise<unknown>=Promise.resolve()
let owner:string|null=null
let generation=0
let activeNetwork:AbortController|null=null
function deadline<T>(promise:Promise<T>,ms:number):Promise<T>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Phone notification operation timed out.')),ms)
  promise.then(value=>{clearTimeout(timer);resolve(value)},err=>{clearTimeout(timer);reject(err)})
 })
}
async function network<T>(work:(signal:AbortSignal)=>Promise<T>){
 const controller=new AbortController();activeNetwork=controller
 try{return await deadline(work(controller.signal),8000)}
 finally{controller.abort();if(activeNetwork===controller)activeNetwork=null}
}
function checkOwner(userId:string,rev:number){
 if(owner!==userId||rev!==generation)throw new Error('The signed-in account changed.')
}
const serial=<T,>(work:()=>Promise<T>):Promise<T>=>{
 const result=tail.then(work,work)
 tail=result.catch(()=>{})
 return result
}
function projectId(){
 const extra=Constants.expoConfig?.extra as {eas?:{projectId?:unknown}}|undefined
 return projectIdFrom(process.env.EXPO_PUBLIC_EAS_PROJECT_ID??Constants.easConfig?.projectId??extra?.eas?.projectId)
}
export function canConfigurePush(){
 return (Platform.OS==='android'||Platform.OS==='ios')&&Constants.executionEnvironment!==ExecutionEnvironment.StoreClient&&!!projectId()
}
async function installationKey(){
 const existing=await SecureStore.getItemAsync(KEY)
 if(existing)return existing
 const crypto=await import('expo-crypto')
 const bytes=await crypto.getRandomBytesAsync(32)
 const key=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
 await SecureStore.setItemAsync(KEY,key)
 return key
}
export async function localPushState(){return readPushState(await SecureStore.getItemAsync(STATE))}
async function save(state:LocalPushState){await SecureStore.setItemAsync(STATE,JSON.stringify(state))}
export function allowPushAccount(userId:string|null){if(owner!==userId){owner=userId;generation++;activeNetwork?.abort()}}
async function revoke(userId:string){
 const key=await SecureStore.getItemAsync(KEY)
 if(key)await network(signal=>api.notifications.revokeDevice(key,userId,signal))
}
async function register(userId:string,prompt:boolean){
 const rev=generation
 checkOwner(userId,rev)
 const id=projectId()
 if(!canConfigurePush()||!id)throw new Error('Background delivery is not configured in this build.')
 const notifications=await import('expo-notifications')
 if(Platform.OS==='android')await deadline(notifications.setNotificationChannelAsync('activity',{
  name:'Account activity',importance:notifications.AndroidImportance.DEFAULT,
  lockscreenVisibility:notifications.AndroidNotificationVisibility.PRIVATE,
 }),8000)
 let permissions=await deadline(notifications.getPermissionsAsync(),8000)
 if(!permissions.granted&&prompt&&permissions.canAskAgain)permissions=await deadline(notifications.requestPermissionsAsync(),60000)
 checkOwner(userId,rev)
 if(!permissions.granted){
  await save({ownerId:userId,desired:false,registered:false})
  await revoke(userId)
  return 'denied' as const
 }
 checkOwner(userId,rev)
 if(prompt)await save({ownerId:userId,desired:true,registered:false})
 const key=await installationKey()
 const token=(await deadline(notifications.getExpoPushTokenAsync({projectId:id}),15000)).data
 checkOwner(userId,rev)
 const result=await network(signal=>api.notifications.registerDevice({installationKey:key,providerToken:token,platform:Platform.OS==='android'?'ANDROID':'IOS',permissionGranted:true,expectedUserId:userId,enableAccountPush:prompt},signal))
 checkOwner(userId,rev)
 if(!result.registered||!result.leaseUntil)throw new Error('The device registration was not confirmed.')
 await save({ownerId:userId,desired:true,registered:true,leaseUntil:result.leaseUntil})
 return 'registered' as const
}
export function enablePush(userId:string){return serial(()=>register(userId,true))}
export function refreshPush(userId:string){
 return serial(async()=>{
  if(owner!==userId||!canConfigurePush()||!shouldRefreshPush(await localPushState(),userId))return
  try{await register(userId,false)}catch(err){if(owner===userId&&err&&typeof err==='object'&&'status' in err&&err.status===403)await save({ownerId:userId,desired:false,registered:false});throw err}
 })
}
export function disablePush(userId:string){
 return serial(async()=>{
  if(owner!==userId)throw new Error('The signed-in account changed.')
  await save({ownerId:userId,desired:false,registered:false})
  await revoke(userId)
 })
}
export async function revokePushBeforeLogout(userId:string){
 if(owner===userId){owner=null;generation++;activeNetwork?.abort()}
 // Invalidate immediately; do not wait on a stalled OS permission dialog or token request.
 // If offline, server-side lease expiry bounds residual generic notifications.
 const rev=generation
 const cleanup=serial(async()=>{
  if(owner!==null||rev!==generation)return
  await save({ownerId:userId,desired:false,registered:false})
  await revoke(userId)
 })
 await deadline(cleanup,5000)
}
