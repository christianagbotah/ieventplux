import {useCallback,useEffect,useRef,useState} from 'react'
import {AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native'
import {api,type DirectCall} from '../api/client'
import {subscribeActivity} from '../lib/activity-signal'
import {mobileDesign} from '../ui/PremiumUI'
import {callDeadline,callSeconds,callStatusFresh,showIncomingForThread} from '../lib/direct-call-ui-policy'
export default function IncomingCallInvitation({userId,visible,currentThread,onAccepted}:{userId:string;visible:boolean;currentThread?:string;onAccepted:(id:string)=>void}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[call,setCall]=useState<DirectCall|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [timing,setTiming]=useState({deadline:0,seen:0}),[now,setNow]=useState(Date.now())
 const active=useRef(false),loading=useRef(false),acting=useRef(false),revision=useRef(0)
 const load=useCallback(async()=>{
  if(!active.current||loading.current||acting.current||AppState.currentState!=='active')return
  loading.current=true;const rev=++revision.current
  try{
   const result=await api.directCalls.incoming(userId)
   if(active.current&&rev===revision.current){
    const received=Date.now(),incoming=result.enabled?result.items.find(row=>row.status==='RINGING'&&row.calleeId===userId)??null:null
    setEnabled(result.enabled);setCall(incoming);setNow(received);setTiming({seen:received,deadline:incoming?callDeadline(incoming.expiresAt,result.serverNow,received):0})
   }
  }catch{if(active.current&&rev===revision.current)setCall(null)}
  finally{if(rev===revision.current)loading.current=false}
 },[userId])
 useEffect(()=>{active.current=true;loading.current=false;void load();return()=>{active.current=false;revision.current++;loading.current=false}},[load])
 useEffect(()=>{
  if(enabled===false)return
  const refresh=()=>void load(),timer=setInterval(refresh,8000),unsubscribe=subscribeActivity(userId,refresh)
  const sub=AppState.addEventListener('change',state=>{if(state==='active')refresh();else{revision.current++;loading.current=false;setCall(null)}})
  return()=>{clearInterval(timer);unsubscribe();sub.remove()}
 },[enabled,load,userId])
 useEffect(()=>{if(!call)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[call?.id])
 const respond=async(action:'accept'|'decline')=>{
  if(!call||acting.current||!active.current||AppState.currentState!=='active'||!callSeconds(timing.deadline,Date.now())||!callStatusFresh(timing.seen,Date.now()))return
  acting.current=true;revision.current++;loading.current=false;setBusy(true);setError('')
  const selected=call
  try{
   const result=await api.directCalls.mutate({action,id:selected.id,expectedUserId:userId})
   if(!active.current)return
   setCall(null)
   if(action==='accept'&&result.call.status==='ACCEPTED')onAccepted(selected.conversationId)
   else if(action==='accept')setError('This invitation is no longer available.')
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not respond to invitation.')}
  finally{acting.current=false;if(active.current){setBusy(false);void load()}}
 }
 const remaining=callSeconds(timing.deadline,now),fresh=callStatusFresh(timing.seen,now)
 if(!enabled||!call||!showIncomingForThread(visible,currentThread,call.conversationId)||!remaining)return null
 return <Modal visible animationType="slide" onRequestClose={()=>{}}><View style={styles.backdrop}><View style={styles.card} accessibilityViewIsModal>
  <View style={styles.mark}><Text style={styles.markText}>{call.kind==='VIDEO'?'VIDEO':'VOICE'}</Text></View>
  <Text style={styles.title}>{call.callerName||'Incoming contact'}</Text><Text style={styles.copy}>Incoming {call.kind.toLowerCase()} invitation · {remaining}s remaining</Text><Text style={styles.copy}>Invitation test mode; audio and video are not connected.</Text>{!fresh&&<Text style={styles.copy}>Reconnecting to confirm invitation…</Text>}
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy||!fresh} style={[styles.button,styles.decline]} onPress={()=>void respond('decline')}><Text style={styles.declineText}>Decline</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||!fresh} style={[styles.button,styles.accept]} onPress={()=>void respond('accept')}><Text style={styles.acceptText}>Accept invitation</Text></Pressable></View>
 </View></View></Modal>
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'#f3f7f5',justifyContent:'center',padding:24},card:{backgroundColor:'#fff',borderRadius:26,padding:26,gap:20},mark:{alignSelf:'center',backgroundColor:'#e8f5ef',borderRadius:56,padding:30},markText:{color:mobileDesign.emerald,fontWeight:'800',fontSize:13},title:{fontSize:28,fontWeight:'800',color:mobileDesign.ink,textAlign:'center'},copy:{fontSize:14,color:mobileDesign.inkMuted,textAlign:'center'},row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{flexGrow:1,minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:12,paddingHorizontal:12},decline:{borderWidth:1,borderColor:mobileDesign.border},accept:{backgroundColor:mobileDesign.emerald},declineText:{color:mobileDesign.ink,fontWeight:'700'},acceptText:{color:'#fff',fontWeight:'700'},error:{color:'#a73530',fontSize:13}})
