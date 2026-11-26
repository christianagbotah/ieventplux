import {useEffect} from 'react'
import {canConfigurePush} from '../lib/push-registration'
import {isActivityHint} from '../lib/push-activity-policy'
import {invalidateActivity} from '../lib/activity-signal'

const handled=new Set<string>()
function remember(id:string){
 if(handled.has(id))return false
 handled.add(id)
 if(handled.size>64){const oldest=handled.values().next().value;if(oldest)handled.delete(oldest)}
 return true
}

/** Only tap events navigate; foreground arrivals remain account-scoped HTTP
 * invalidation hints. No provider URL, user id, or message data is trusted. */
export default function PushActivityBridge({ready,userId,onOpen}:{ready:boolean;userId?:string;onOpen:()=>void}){
 useEffect(()=>{
  if(!ready||!canConfigurePush())return
  let active=true
  let cleanup=()=>{}
  void import('expo-notifications').then(async notifications=>{
   if(!active)return
   notifications.setNotificationHandler({
    handleNotification:async notification=>{
     const activity=isActivityHint(notification.request.content.data)
     return {shouldShowAlert:!activity,shouldPlaySound:false,shouldSetBadge:false}
    }
   })
   const open=async(response:Awaited<ReturnType<typeof notifications.getLastNotificationResponseAsync>>)=>{
    if(!active||!response||response.actionIdentifier!==notifications.DEFAULT_ACTION_IDENTIFIER)return
    const request=response.notification.request
    if(!isActivityHint(request.content.data))return
    if(remember(request.identifier))onOpen()
    // The last response can be replayed at a future launch. Consume it now.
    await notifications.clearLastNotificationResponseAsync().catch(()=>{})
   }
   const received=notifications.addNotificationReceivedListener(notification=>{
    if(active&&userId&&isActivityHint(notification.request.content.data))invalidateActivity(userId)
   })
   const tapped=notifications.addNotificationResponseReceivedListener(response=>void open(response).catch(()=>{}))
   cleanup=()=>{received.remove();tapped.remove()}
   await open(await notifications.getLastNotificationResponseAsync())
  }).catch(()=>{})
  return()=>{active=false;cleanup()}
 },[ready,userId,onOpen])
 return null
}
