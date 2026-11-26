import {useCallback,useEffect,useRef,useState} from 'react'
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native'
import {api,ApiClientError,type EventDetail,type EventReminderState,type EventWaitlistState} from '../api/client'
import {useSession} from '../store/session'
import {SectionHeading,mobileDesign} from '../ui/PremiumUI'
import {allTicketsSoldOut,canJoinDemandWaitlist,demandDenied,eventDemandOpen,waitlistPartySize} from '../lib/event-demand'

type DemandState={kind:'loading'}|{kind:'denied'}|{kind:'error';message:string}|{kind:'ready';reminder:EventReminderState;waitlist:EventWaitlistState}
const errorText=(reason:unknown)=>reason instanceof ApiClientError?reason.message:'Could not connect. Please try again.'

/** Native attendee controls use the same authoritative API as the web portal. */
export function EventDemandCard({event,canManage}:{event:EventDetail;canManage:boolean}){
 const {user,status:sessionStatus}=useSession()
 const open=eventDemandOpen(event.status,event.startsAt)
 const soldOut=allTicketsSoldOut(event.ticketTypes)
 const [state,setState]=useState<DemandState>({kind:'loading'})
 const [contact,setContact]=useState(user?.email??'')
 const [party,setParty]=useState('1')
 const [busy,setBusy]=useState(false)
 const [feedback,setFeedback]=useState('')
 const [failure,setFailure]=useState('')
 const revision=useRef(0)
 const locked=useRef(false)
 const load=useCallback(async()=>{
  const version=++revision.current
  setState({kind:'loading'})
  try{
   const [reminder,waitlist]=await Promise.all([api.events.reminder(event.id),api.events.waitlist(event.id)])
   if(version!==revision.current)return false
   setState({kind:'ready',reminder,waitlist})
   return true
  }catch(reason){
   if(version!==revision.current)return false
   setState(reason instanceof ApiClientError&&demandDenied(reason.status)?{kind:'denied'}:{kind:'error',message:errorText(reason)})
   return false
  }
 },[event.id])
 useEffect(()=>{
  setContact(user?.email??'');setParty('1');setFeedback('');setFailure('')
  if(!canManage&&open&&user&&sessionStatus==='authenticated')void load()
  else setState({kind:'loading'})
  return()=>{revision.current++}
 },[canManage,open,user?.id,user?.email,sessionStatus,load])
 if(canManage||!open)return null
 if(sessionStatus==='restoring')return null
 if(!user||sessionStatus!=='authenticated')return null

 const act=async(action:()=>Promise<unknown>,success:string)=>{
  if(locked.current)return
  locked.current=true;setBusy(true);setFeedback('');setFailure('')
  try{
   await action()
   setFeedback(success)
   const refreshed=await load()
   if(!refreshed)setFeedback(success+' Current status could not be refreshed.')
  }catch(reason){setFailure(errorText(reason))}
  finally{locked.current=false;setBusy(false)}
 }
 if(state.kind==='denied')return null
 const size=waitlistPartySize(party)
 const mine=state.kind==='ready'?state.waitlist.mine:null
 const join=state.kind==='ready'&&canJoinDemandWaitlist({open,soldOut,status:mine?.status})
 const leave=mine?.status==='WAITING'||mine?.status==='NOTIFIED'
 const showReminder=state.kind==='ready'&&(state.reminder.active||(state.reminder.upcoming&&!state.reminder.holdingTicket))
 if(state.kind==='ready'&&!showReminder&&!join&&!leave&&!feedback&&!failure)return null
 return <View style={styles.section}>
  <SectionHeading eyebrow="STAY CONNECTED" title="Never miss out" subtitle="Manage event reminders and sold-out ticket alerts."/>
  <View style={styles.card}>
   {feedback?<Text style={styles.success} accessibilityLiveRegion="polite">{feedback}</Text>:null}
   {failure?<Text style={styles.error} accessibilityLiveRegion="polite">{failure}</Text>:null}
   {state.kind==='loading'?<ActivityIndicator color={mobileDesign.emerald}/>:null}
   {state.kind==='error'?<><Text style={styles.error}>{state.message}</Text><Pressable accessibilityRole="button" style={styles.secondary} disabled={busy} onPress={()=>void load()}><Text style={styles.secondaryText}>Retry</Text></Pressable></>:null}
   {state.kind==='ready'?<>
    {showReminder?<View style={styles.block}>
     <Text style={styles.heading}>{state.reminder.active?'Reminder is on':'Remind me'}</Text>
     <Text style={styles.body}>Receive an in-app alert before this event starts.</Text>
     <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} style={state.reminder.active?styles.secondary:styles.primary} onPress={()=>void act(()=>api.events.setReminder(event.id,!state.reminder.active),state.reminder.active?'Reminder removed.':'Reminder saved.')}>
      <Text style={state.reminder.active?styles.secondaryText:styles.primaryText}>{state.reminder.active?'Remove reminder':'Set reminder'}</Text>
     </Pressable>
    </View>:null}
    {join||leave?<View style={[styles.block,showReminder?styles.divider:null]}>
     <Text style={styles.heading}>{mine?.status==='WAITING'?'You are on the waitlist':mine?.status==='NOTIFIED'?'Tickets may be available':'Join the waitlist'}</Text>
     <Text style={styles.body}>{mine?.status==='WAITING'?('Position '+mine.position+' · '+mine.partySize+' '+(mine.partySize===1?'pass':'passes')):'We will alert you when tickets become available. No ticket is reserved.'}</Text>
     {join?<><Text style={styles.label}>Contact email or phone</Text>
      <TextInput value={contact} onChangeText={setContact} editable={!busy} autoCapitalize="none" autoCorrect={false} style={styles.input} accessibilityLabel="Waitlist contact"/>
      <Text style={styles.label}>Number of passes (1–10)</Text>
      <TextInput value={party} onChangeText={setParty} editable={!busy} keyboardType="number-pad" maxLength={2} style={styles.input} accessibilityLabel="Waitlist party size"/>
      <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||size===null||contact.trim().length<5||user.displayName.trim().length<2}} disabled={busy||size===null||contact.trim().length<5||user.displayName.trim().length<2} style={[styles.primary,(busy||size===null||contact.trim().length<5||user.displayName.trim().length<2)&&styles.disabled]} onPress={()=>{if(size!==null)void act(()=>api.events.joinWaitlist(event.id,{name:user.displayName,contact:contact.trim(),partySize:size}),'Waitlist request accepted.')}}><Text style={styles.primaryText}>{mine?.status==='NOTIFIED'?'Rejoin waitlist':'Join waitlist'}</Text></Pressable></>:null}
     {leave?<Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={()=>void act(()=>api.events.leaveWaitlist(event.id),'You left the waitlist.')}><Text style={styles.secondaryText}>Leave waitlist</Text></Pressable>:null}
    </View>:null}
   </>:null}
   {busy&&state.kind!=='loading'?<ActivityIndicator color={mobileDesign.emerald}/>:null}
  </View>
 </View>
}
const styles=StyleSheet.create({
 section:{marginTop:28},
 card:{borderRadius:24,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff',padding:18,gap:12},
 block:{gap:10},
 divider:{borderTopWidth:1,borderTopColor:mobileDesign.border,paddingTop:16,marginTop:5},
 heading:{fontSize:16,fontWeight:'900',color:mobileDesign.ink},
 body:{fontSize:13,lineHeight:20,color:mobileDesign.inkMuted},
 label:{fontSize:12,fontWeight:'800',color:mobileDesign.ink},
 input:{minHeight:48,paddingHorizontal:13,borderRadius:14,borderWidth:1,borderColor:mobileDesign.border,color:mobileDesign.ink,backgroundColor:'#fff',fontSize:15},
 primary:{minHeight:48,borderRadius:15,backgroundColor:mobileDesign.emerald,alignItems:'center',justifyContent:'center',padding:12},
 primaryText:{fontSize:14,fontWeight:'800',color:'#fff'},
 secondary:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',justifyContent:'center',padding:11},
 secondaryText:{fontSize:14,fontWeight:'800',color:mobileDesign.emerald},
 success:{fontSize:13,lineHeight:20,color:mobileDesign.emerald,fontWeight:'700'},
 error:{fontSize:13,lineHeight:20,color:'#b42318'},
 disabled:{opacity:.45},
})
