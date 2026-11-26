import {useCallback,useRef,useState} from 'react'
import {ActivityIndicator,AppState,FlatList,Pressable,RefreshControl,StyleSheet,Text,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {api,ApiClientError,formatDateTime,type NotificationItem} from '../api/client'
import {useSession} from '../store/session'
import {subscribeActivity} from '../lib/activity-signal'
import {alertDestination,mergeAlerts} from '../lib/notification-inbox'
import {mobileDesign} from '../ui/PremiumUI'
import type {NotificationsScreenProps} from '../navigation'

const errorMessage=(err:unknown)=>err instanceof ApiClientError?err.message:'Unable to connect. Try again.'
export default function NotificationsScreen(props:NotificationsScreenProps){
 const {status,user}=useSession()
 if(status!=='authenticated'||!user)return <View style={styles.center}>
   <Text style={styles.heading}>Sign in to see your notifications</Text>
   <Pressable style={styles.primary} accessibilityRole="button" onPress={()=>props.navigation.navigate('Login')}><Text style={styles.primaryText}>Sign in</Text></Pressable>
 </View>
 // Account switch unmounts the previous private inbox. Never cache its contents.
 return <Inbox key={user.id} {...props}/>
}
function Inbox({navigation}:NotificationsScreenProps){
 const {user}=useSession()
 const [rows,setRows]=useState<NotificationItem[]>([])
 const [unread,setUnread]=useState(0)
 const [page,setPage]=useState(1)
 const [more,setMore]=useState(false)
 const [loaded,setLoaded]=useState(false)
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const revision=useRef(0)
 const pageRef=useRef(1)
 const locked=useRef(false)
 const load=useCallback(async(next=1)=>{
  if(locked.current)return
  locked.current=true
  const current=++revision.current
  setLoading(true);setError('')
  try{
   const result=await api.notifications.list(next)
   if(current!==revision.current)return
   setRows(previous=>next===1?result.items:mergeAlerts(previous,result.items))
   setUnread(result.unread);setPage(next);pageRef.current=next;setMore(result.hasMore??result.items.length===20);setLoaded(true)
  }catch(err){
   if(current===revision.current)setError(errorMessage(err))
  }finally{
   if(current===revision.current){setLoading(false);locked.current=false}
  }
 },[])
 useFocusEffect(useCallback(()=>{
  locked.current=false;setBusy(false);void load()
  const refresh=()=>{if(AppState.currentState==='active'&&pageRef.current===1&&!locked.current)void load()}
  const unsubscribe=user?.id?subscribeActivity(user.id,refresh):()=>{}
  const timer=setInterval(refresh,8000)
  return()=>{unsubscribe();clearInterval(timer);revision.current++;locked.current=false}
 },[load,user?.id]))
 const mark=async(row?:NotificationItem)=>{
  if(locked.current)return
  locked.current=true;setBusy(true);setError('')
  const current=++revision.current
  let navigateAfter=false
  try{
   if(!row||!row.readAt){
    const result=row?await api.notifications.mark(row.id):await api.notifications.markAll()
    if(!result.ok)throw new Error('Read acknowledgement failed')
    if(current!==revision.current)return
    // Only a successful server acknowledgement changes the local read state.
    const readAt=new Date().toISOString()
    setRows(previous=>previous.map(item=>(!row||item.id===row.id)&&!item.readAt?{...item,readAt}:item))
    setUnread(previous=>row?Math.max(0,previous-1):0)
   }
   navigateAfter=true
  }catch(err){if(current===revision.current)setError(errorMessage(err))}
  finally{
   if(current===revision.current){locked.current=false;setBusy(false)}
  }
  if(!navigateAfter||current!==revision.current)return
  const target=alertDestination(row?.link)
  if(target?.screen==='EventDetail')navigation.navigate('EventDetail',{eventId:target.eventId})
  else if(target?.screen==='MyTickets')navigation.navigate('MyTickets',{segment:target.segment})
  else if(target?.screen==='DirectMessages')navigation.navigate('DirectMessages',{id:target.id})
  else if(target?.screen==='MarketplaceStore')navigation.navigate('MarketplaceStore',{slug:target.slug})
  else void load()
 }
 return <FlatList style={styles.screen} contentContainerStyle={styles.content} data={rows} keyExtractor={item=>item.id}
  refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()} tintColor={mobileDesign.emerald}/>}
  ListHeaderComponent={<View style={styles.header}>
   <View style={styles.headerRow}><Text style={styles.count}>{unread} unread</Text>
    <Pressable disabled={busy||loading||unread===0} accessibilityRole="button" accessibilityState={{disabled:busy||loading||unread===0}} onPress={()=>void mark()} style={[styles.secondary,(busy||loading||unread===0)&&styles.disabled]}><Text style={styles.secondaryText}>Mark all read</Text></Pressable>
   </View>
   {error?<View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} disabled={busy||loading} style={styles.secondary}><Text style={styles.secondaryText}>Try again</Text></Pressable></View>:null}
  </View>}
  ListEmptyComponent={loading&&!loaded?<ActivityIndicator style={{marginTop:28}} color={mobileDesign.emerald}/>:loaded&&!error?<View style={styles.empty}><Text style={styles.heading}>You're all caught up</Text><Text style={styles.body}>Reminders, ticket updates and event alerts appear here.</Text></View>:null}
  renderItem={({item})=>{
   const target=alertDestination(item.link)
   const actionable=!item.readAt||!!target
   return <Pressable accessibilityRole={actionable?'button':undefined} accessibilityLabel={item.title+(item.readAt?'':', unread')} accessibilityState={{disabled:busy||loading||!actionable}}
    disabled={busy||loading||!actionable} onPress={()=>void mark(item)} style={({pressed})=>[styles.card,!item.readAt&&styles.unread,pressed&&{opacity:.75}]}>
    <View style={[styles.dot,!!item.readAt&&styles.readDot]}/>
    <View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.body}</Text><Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
     {target?<Text style={styles.link}>{target.screen==='EventDetail'?'View event ›':target.screen==='MarketplaceStore'?'View storefront ›':target.screen==='DirectMessages'?'Open conversation ›':'Open wallet ›'}</Text>:!item.readAt?<Text style={styles.link}>Mark read</Text>:null}
    </View>
   </Pressable>
  }}
  ListFooterComponent={more?<Pressable accessibilityRole="button" disabled={busy||loading} onPress={()=>void load(page+1)} style={styles.secondary}><Text style={styles.secondaryText}>{loading?'Loading…':'Load more'}</Text></Pressable>:null}
 />
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:16,paddingBottom:30},
 center:{flex:1,padding:20,justifyContent:'center',gap:14,backgroundColor:mobileDesign.canvas},
 header:{marginBottom:12,gap:10},headerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8},
 count:{fontSize:14,fontWeight:'700',color:mobileDesign.ink},heading:{fontSize:18,fontWeight:'700',color:mobileDesign.ink},
 card:{flexDirection:'row',gap:10,backgroundColor:'#fff',borderColor:mobileDesign.border,borderWidth:1,borderRadius:14,padding:14,marginBottom:10},
 unread:{borderColor:mobileDesign.emerald,backgroundColor:'#f0faf7'},dot:{width:8,height:8,borderRadius:4,backgroundColor:mobileDesign.emerald,marginTop:6},readDot:{backgroundColor:mobileDesign.border},
 copy:{flex:1,minWidth:0},title:{fontSize:15,lineHeight:21,fontWeight:'700',color:mobileDesign.ink},body:{fontSize:14,lineHeight:21,color:mobileDesign.inkMuted,marginTop:4},
 meta:{fontSize:12,lineHeight:18,color:mobileDesign.inkMuted,marginTop:8},link:{fontSize:13,fontWeight:'600',color:mobileDesign.emerald,marginTop:8},
 empty:{padding:20,gap:6,alignItems:'center',marginTop:20},secondary:{minHeight:44,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:9,borderRadius:10,justifyContent:'center',alignItems:'center'},
 secondaryText:{fontSize:13,fontWeight:'600',color:mobileDesign.emerald},disabled:{opacity:.5},primary:{minHeight:48,backgroundColor:mobileDesign.emerald,alignItems:'center',justifyContent:'center',borderRadius:12},primaryText:{color:'#fff',fontWeight:'700',fontSize:14},
 errorBox:{padding:12,borderRadius:12,backgroundColor:'#fdf2f2',gap:8},error:{color:'#a73530',fontSize:13,lineHeight:20},
})
