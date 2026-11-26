/** Private foreground activity reconciliation. OS push is a separate transport. */
import {useEffect,useRef,useState} from 'react'
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native'
import {api,absoluteUrl} from '../api/client'
import {io} from 'socket.io-client'
import {invalidateActivity} from '../lib/activity-signal'
import {reconcileActivity,type ActivityCursor} from '../lib/foreground-activity'
import {mobileDesign} from '../ui/PremiumUI'

export default function ForegroundActivity({userId,visible,onOpen}:{userId:string;visible:boolean;onOpen:()=>void}){
 const [unread,setUnread]=useState<number|null>(null)
 const [notice,setNotice]=useState('')
 const cursor=useRef<ActivityCursor|null>(null)
 useEffect(()=>{
  let alive=true
  let running=false
  let dirty=false
  let active=AppState.currentState==='active'
  let joined=false
  let lastRefresh=0
  let debounce:ReturnType<typeof setTimeout>|null=null
  const endpoint=absoluteUrl('/')
  // Session cookies authenticate the existing gateway. No credentials or room
  // grants are fabricated; an unsupported native cookie handshake falls back
  // to the authenticated HTTP API.
  const socket=endpoint?io(endpoint,{path:'/socket.io/',withCredentials:true,autoConnect:false,
   transports:['websocket','polling'],reconnection:true,reconnectionAttempts:6,reconnectionDelay:1000,timeout:10000}):null
  const refresh=async()=>{
   if(!alive||!active)return
   if(running){dirty=true;return}
   running=true
   try{
    const data=await api.notifications.list()
    if(!alive||!active)return
    const next=reconcileActivity(cursor.current,data.items)
    cursor.current=next.cursor
    lastRefresh=Date.now()
    setUnread(data.unread)
    if(next.fresh.length) setNotice(next.fresh.length===1 ? 'New activity' : next.fresh.length+' new updates')
    if(data.unread===0)setNotice('')
   }catch{/* Keep the last confirmed count during temporary network failures. */}
   finally{
    running=false
    if(dirty&&alive&&active){dirty=false;void refresh()}
   }
  }
  const wake=()=>{
   if(!alive||!active||!joined)return
   // Socket events are invalidation hints only. All user-visible data is
   // re-read through the private, authenticated notification endpoint.
   if(debounce!==null)return
   debounce=setTimeout(()=>{debounce=null;if(alive&&active&&joined){void refresh();invalidateActivity(userId)}},200)
  }
  socket?.on('connect',()=>{joined=false;socket.emit('join',{room:`user:${userId}`})})
  socket?.on('room:joined',(data:{room?:string})=>{
   if(data?.room!==`user:${userId}`||!active)return
   joined=true
   wake()
  })
  socket?.on('notification',wake)
  socket?.on('notification:read',wake)
  socket?.on('disconnect',()=>{joined=false})
  socket?.on('room:denied',()=>{joined=false;socket.disconnect()})
  const sub=AppState.addEventListener('change',state=>{
   active=state==='active'
   if(active){socket?.connect();void refresh();invalidateActivity(userId)}
   else{joined=false;socket?.disconnect();if(debounce!==null){clearTimeout(debounce);debounce=null}}
  })
  const timer=setInterval(()=>{
   if(!joined||Date.now()-lastRefresh>=30000)void refresh()
  },8000)
  if(active){socket?.connect();void refresh()}
  return()=>{
   alive=false
   clearInterval(timer)
   if(debounce!==null)clearTimeout(debounce)
   sub.remove()
   socket?.removeAllListeners()
   socket?.disconnect()
  }
 },[userId])

 if(!visible||unread===null||unread===0)return null
 return <View style={styles.outer}>
  <Pressable accessibilityRole="button" accessibilityLabel={unread+' unread notifications'} onPress={()=>{setNotice('');onOpen()}} style={styles.action}>
   <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.label}>{notice||'Notifications'}</Text>
   <View style={styles.badge}><Text style={styles.count}>{unread>99?'99+':unread}</Text></View>
   <Text style={styles.label}>View ›</Text>
  </Pressable>
 </View>
}
const styles=StyleSheet.create({
 outer:{marginHorizontal:12,marginTop:4,marginBottom:3,borderRadius:12,backgroundColor:'#eff9f5',borderColor:mobileDesign.border,borderWidth:1},
 action:{minHeight:44,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9},
 label:{color:mobileDesign.emerald,fontWeight:'700',fontSize:13,flexShrink:1},
 badge:{backgroundColor:mobileDesign.emerald,borderRadius:20,minWidth:24,paddingHorizontal:6,paddingVertical:3,alignItems:'center'},
 count:{color:'#fff',fontSize:12,fontWeight:'700'}
})
