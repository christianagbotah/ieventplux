import {useCallback,useEffect,useRef,useState} from 'react'
import {AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native'
import {api,type DirectCall} from '../api/client'
import {subscribeActivity} from '../lib/activity-signal'
import {mobileDesign} from '../ui/PremiumUI'
export default function IncomingCallInvitation({userId,visible,onAccepted}:{userId:string;visible:boolean;onAccepted:(id:string)=>void}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[call,setCall]=useState<DirectCall|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const active=useRef(false),loading=useRef(false),acting=useRef(false),revision=useRef(0)
 const load=useCallback(async()=>{
  if(!active.current||loading.current||AppState.currentState!=='active')return
  loading.current=true;const rev=++revision.current
  try{
   const result=await api.directCalls.incoming(userId)
   if(active.current&&rev===revision.current){setEnabled(result.enabled);setCall(result.enabled?result.items.find(row=>row.status==='RINGING'&&row.calleeId===userId&&Date.parse(row.expiresAt)>Date.now())??null:null)}
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
 const respond=async(action:'accept'|'decline')=>{
  if(!call||acting.current||!active.current)return
  acting.current=true;setBusy(true);setError('')
  const selected=call
  try{
   const result=await api.directCalls.mutate({action,id:selected.id,expectedUserId:userId})
   if(!active.current)return
   setCall(null)
   if(action==='accept'&&result.call.status==='ACCEPTED')onAccepted(selected.conversationId)
   else if(action==='accept')setError('This invitation is no longer available.')
   void load()
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not respond to invitation.')}
  finally{acting.current=false;if(active.current)setBusy(false)}
 }
 if(!enabled||!visible||!call)return null
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{}}><View style={styles.backdrop}><View style={styles.card} accessibilityViewIsModal>
  <View style={styles.mark}><Text style={styles.markText}>{call.kind==='VIDEO'?'VIDEO':'VOICE'}</Text></View>
  <Text style={styles.title}>Incoming {call.kind.toLowerCase()} invitation</Text><Text style={styles.copy}>Private call test mode. Accepting opens the conversation; audio and video are not connected.</Text>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy} style={[styles.button,styles.decline]} onPress={()=>void respond('decline')}><Text style={styles.declineText}>Decline</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={[styles.button,styles.accept]} onPress={()=>void respond('accept')}><Text style={styles.acceptText}>Accept invitation</Text></Pressable></View>
 </View></View></Modal>
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',padding:24},card:{backgroundColor:'#fff',borderRadius:22,padding:22,gap:14},mark:{alignSelf:'center',backgroundColor:'#e8f5ef',borderRadius:24,padding:16},markText:{color:mobileDesign.emerald,fontWeight:'800',fontSize:13},title:{fontSize:21,fontWeight:'800',color:mobileDesign.ink,textAlign:'center'},copy:{fontSize:14,color:mobileDesign.inkMuted,textAlign:'center'},row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{flexGrow:1,minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:12,paddingHorizontal:12},decline:{borderWidth:1,borderColor:mobileDesign.border},accept:{backgroundColor:mobileDesign.emerald},declineText:{color:mobileDesign.ink,fontWeight:'700'},acceptText:{color:'#fff',fontWeight:'700'},error:{color:'#a73530',fontSize:13}})
