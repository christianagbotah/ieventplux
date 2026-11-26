import {useCallback,useEffect,useRef,useState} from 'react'
import {AppState,Pressable,Text,View,StyleSheet,ScrollView} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {api,formatDateTime,type DirectCall} from '../api/client'
import {subscribeActivity} from '../lib/activity-signal'
import {mobileDesign} from '../ui/PremiumUI'
import {callDeadline,callSeconds,callStatusFresh} from '../lib/direct-call-ui-policy'
type Result={enabled:boolean;mediaAvailable:boolean;items:DirectCall[];serverNow?:string}
export default function DirectCallControls({conversationId,userId,canSend}:{conversationId:string;userId:string;canSend:boolean}){
 const [data,setData]=useState<Result|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [history,setHistory]=useState(false)
 const [seen,setSeen]=useState(0),[now,setNow]=useState(Date.now())
 const focused=useRef(false),inFlight=useRef(false),revision=useRef(0),acting=useRef(false)
 const pending=useRef<{kind:'VOICE'|'VIDEO';key:string}|null>(null)
 const load=useCallback(async()=>{
  if(!focused.current||inFlight.current||acting.current||AppState.currentState!=='active')return
  inFlight.current=true;const rev=++revision.current
  try{const result=await api.directCalls.list(conversationId,userId);if(focused.current&&rev===revision.current){setData(result);const at=Date.now();setSeen(at);setNow(at);setError('')}}
  catch{if(focused.current&&rev===revision.current)setError('Could not refresh call invitations.')}
  finally{if(rev===revision.current)inFlight.current=false}
 },[conversationId,userId])
 useFocusEffect(useCallback(()=>{
  focused.current=true;inFlight.current=false;void load()
  return()=>{focused.current=false;revision.current++;inFlight.current=false}
 },[load]))
 useFocusEffect(useCallback(()=>{
  if(!data?.enabled)return
  const refresh=()=>{if(AppState.currentState==='active')void load()}
  const timer=setInterval(refresh,5000),unsub=subscribeActivity(userId,refresh)
  const app=AppState.addEventListener('change',state=>{if(state==='active')refresh()})
  return()=>{clearInterval(timer);unsub();app.remove()}
 },[data?.enabled,load,userId]))
 useEffect(()=>{if(!data?.enabled)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[data?.enabled])
 const action=async(payload:Record<string,unknown>)=>{
  if(acting.current||!focused.current||!callStatusFresh(seen,Date.now())||AppState.currentState!=='active')return
  acting.current=true;revision.current++;inFlight.current=false;setBusy(true);setError('')
  try{const result=await api.directCalls.mutate({...payload,expectedUserId:userId});pending.current=null;if(focused.current){setData(old=>old?{...old,items:[result.call,...old.items.filter(row=>row.id!==result.call.id)]}:old);setSeen(0)}}
  catch(err){if(focused.current)setError(err instanceof Error?err.message:'Call action unavailable.')}
  finally{acting.current=false;setBusy(false);if(focused.current)void load()}
 }
 const start=async(kind:'VOICE'|'VIDEO')=>{
  if(!canSend||acting.current||!focused.current||!callStatusFresh(seen,Date.now()))return
  if(pending.current&&pending.current.kind!==kind){setError('Retry the original invitation type first.');return}
  try{
   acting.current=true;setBusy(true)
   if(!pending.current){const crypto=await import('expo-crypto');pending.current={kind,key:crypto.randomUUID()}}
  }catch{setError('Could not prepare invitation.');return}
  finally{acting.current=false;setBusy(false)}
  if(pending.current&&focused.current)await action({action:'start',conversationId,kind,clientKey:pending.current.key})
 }
 if(!data?.enabled)return null
 const call=data.items.find(row=>row.status==='RINGING'||row.status==='ACCEPTED')
 const incoming=call?.calleeId===userId
 const remaining=call?callSeconds(callDeadline(call.expiresAt,data.serverNow,seen),now):0
 const fresh=callStatusFresh(seen,now),locked=busy||!fresh
 const button=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:.5}]}><Text style={styles.buttonText}>{label}</Text></Pressable>
 return <View style={styles.panel}>
  <View style={styles.row}>{!call&&canSend&&<>{button('Voice invite',()=>void start('VOICE'),locked)}{button('Video invite',()=>void start('VIDEO'),locked)}</>}{button(history?'Hide history':'Call history',()=>setHistory(v=>!v))}</View>
  {!data.mediaAvailable&&<Text style={styles.muted}>Invitation test mode · media connection unavailable.</Text>}
  {!fresh&&<Text style={styles.muted}>Checking current call status…</Text>}
  {call&&<View style={styles.panel}><Text style={styles.title}>{call.status==='ACCEPTED'?'Invitation accepted':incoming?'Incoming '+call.kind.toLowerCase()+' invitation':'Calling…'}</Text><Text style={styles.muted}>{call.status==='ACCEPTED'?'Media is not connected.':incoming?'Accept or decline.':'Waiting for recipient.'}</Text><Text style={styles.muted}>{fresh&&remaining>0?remaining+'s remaining':'Awaiting server confirmation'}</Text><View style={styles.row}>
  {call.status==='RINGING'&&incoming&&<>{button('Accept',()=>void action({action:'accept',id:call.id}),locked||!remaining||!canSend)}{button('Decline',()=>void action({action:'decline',id:call.id}),locked||!remaining)}</>}
  {call.status==='RINGING'&&!incoming&&call.thisDevice&&button('Cancel invitation',()=>void action({action:'cancel',id:call.id}),locked||!remaining)}
  {call.status==='ACCEPTED'&&call.thisDevice&&button('End invitation',()=>void action({action:'end',id:call.id}),locked||!remaining)}
  {call.status==='ACCEPTED'&&!call.thisDevice&&<Text style={styles.muted}>Accepted on another device.</Text>}</View></View>}
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {history&&<ScrollView style={{maxHeight:144}} nestedScrollEnabled>{data.items.length?data.items.map(row=><View key={row.id} style={styles.history}><Text style={styles.title}>{row.callerId===userId?'Outgoing':'Incoming'} {row.kind.toLowerCase()} · {row.status.toLowerCase()}</Text><Text style={styles.muted}>{formatDateTime(row.createdAt)}</Text></View>):<Text style={styles.muted}>No call history.</Text>}</ScrollView>}
 </View>
}
const styles=StyleSheet.create({panel:{padding:8,gap:6,borderRadius:12,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff'},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:6},button:{minHeight:40,borderWidth:1,borderColor:mobileDesign.border,borderRadius:9,paddingHorizontal:10,justifyContent:'center'},buttonText:{fontWeight:'700',fontSize:12,color:mobileDesign.emerald},title:{fontWeight:'600',fontSize:13,color:mobileDesign.ink},muted:{fontSize:12,color:mobileDesign.inkMuted},error:{fontSize:12,color:'#a73530'},history:{paddingVertical:6,borderBottomWidth:1,borderColor:mobileDesign.border}})
