import {Platform} from 'react-native'
import Constants,{ExecutionEnvironment} from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import {api} from '../api/client'
import {projectIdFrom,readPushState,shouldRefreshPush,type LocalPushState} from './push-registration-policy'

const KEY='ieventplux.push.installation'
const STATE='ieventplux.push.preference'
let tail:Promise<unknown>=Promise.resolve()
const blocked=new Set<string>()
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
export function allowPushAccount(userId:string){blocked.delete(userId)}
async function revoke(userId:string){
 const key=await SecureStore.getItemAsync(KEY)
 if(key)await api.notifications.revokeDevice(key,userId)
}
async function register(userId:string,prompt:boolean){
 if(blocked.has(userId))throw new Error('The account is signing out.')
 const id=projectId()
 if(!canConfigurePush()||!id)throw new Error('Background delivery is not configured in this build.')
 const notifications=await import('expo-notifications')
 if(Platform.OS==='android')await notifications.setNotificationChannelAsync('activity',{
  name:'Account activity',importance:notifications.AndroidImportance.DEFAULT,
  lockscreenVisibility:notifications.AndroidNotificationVisibility.PRIVATE,
 })
 let permissions=await notifications.getPermissionsAsync()
 if(!permissions.granted&&prompt&&permissions.canAskAgain)permissions=await notifications.requestPermissionsAsync()
 if(!permissions.granted){
  await save({ownerId:userId,desired:false,registered:false})
  await revoke(userId)
  return 'denied' as const
 }
 if(blocked.has(userId))throw new Error('The account is signing out.')
 await save({ownerId:userId,desired:true,registered:false})
 const key=await installationKey()
 const token=(await notifications.getExpoPushTokenAsync({projectId:id})).data
 if(blocked.has(userId))throw new Error('The account is signing out.')
 const result=await api.notifications.registerDevice({installationKey:key,providerToken:token,platform:Platform.OS==='android'?'ANDROID':'IOS',permissionGranted:true,expectedUserId:userId})
 if(!result.registered)throw new Error('The device registration was not confirmed.')
 await save({ownerId:userId,desired:true,registered:true})
 return 'registered' as const
}
export function enablePush(userId:string){return serial(()=>register(userId,true))}
export function refreshPush(userId:string){
 return serial(async()=>{
  if(blocked.has(userId)||!canConfigurePush()||!shouldRefreshPush(await localPushState(),userId))return
  await register(userId,false)
 })
}
export function disablePush(userId:string){
 return serial(async()=>{
  await save({ownerId:userId,desired:false,registered:false})
  await revoke(userId)
 })
}
export function revokePushBeforeLogout(userId:string){
 blocked.add(userId)
 return disablePush(userId)
}
