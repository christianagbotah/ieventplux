/** Private foreground activity reconciliation. OS push is a separate transport. */
import {useEffect,useRef,useState} from 'react'
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native'
import {api} from '../api/client'
import {reconcileActivity,type ActivityCursor} from '../lib/foreground-activity'
import {mobileDesign} from '../ui/PremiumUI'

export default function ForegroundActivity({visible,onOpen}:{visible:boolean;onOpen:()=>void}){
 const [unread,setUnread]=useState<number|null>(null)
 const [notice,setNotice]=useState('')
 const cursor=useRef<ActivityCursor|null>(null)
 useEffect(()=>{
  let alive=true
  let running=false
  let active=AppState.currentState==='active'
  const refresh=async()=>{
   if(!alive||running||!active)return
   running=true
   try{
    const data=await api.notifications.list()
    if(!alive||!active)return
    const next=reconcileActivity(cursor.current,data.items)
    cursor.current=next.cursor
    setUnread(data.unread)
    if(next.fresh.length) setNotice(next.fresh.length===1 ? 'New activity' : next.fresh.length+' new updates')
    if(data.unread===0)setNotice('')
   }catch{/* Keep the last confirmed count during temporary network failures. */}
   finally{running=false}
  }
  const sub=AppState.addEventListener('change',state=>{active=state==='active';if(active)void refresh()})
  const timer=setInterval(()=>void refresh(),8000)
  void refresh()
  return()=>{alive=false;clearInterval(timer);sub.remove()}
 },[])
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
