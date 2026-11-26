import {useState,useCallback} from 'react'
import {ActivityIndicator,AppState,Linking,Pressable,StyleSheet,Text,View} from 'react-native'
import {canConfigurePush,disablePush,enablePush,localPushState} from '../lib/push-registration'
import {mobileDesign} from '../ui/PremiumUI'
import {hasFreshPushLease} from '../lib/push-registration-policy'
import {useFocusEffect} from '@react-navigation/native'
export default function PushSettings({userId}:{userId:string}){
 const [busy,setBusy]=useState(false)
 const [registered,setRegistered]=useState(false)
 const [desired,setDesired]=useState(false)
 const [notice,setNotice]=useState('')
 const [denied,setDenied]=useState(false)
 const configured=canConfigurePush()
 useFocusEffect(useCallback(()=>{
  let alive=true
  const refresh=()=>void localPushState().then(s=>{if(alive){setRegistered(hasFreshPushLease(s,userId));setDesired(s?.ownerId===userId&&s.desired===true)}}).catch(()=>{})
  refresh();const timer=setInterval(refresh,5000)
  const sub=AppState.addEventListener('change',s=>{if(s==='active')refresh()})
  return()=>{alive=false;clearInterval(timer);sub.remove()}
 },[userId]))
 const change=async(enable:boolean)=>{
  setBusy(true);setNotice('');setDenied(false)
  try{
   if(enable){
    const result=await enablePush(userId)
    setRegistered(result==='registered');setDesired(result==='registered')
    setDenied(result==='denied')
    setNotice(result==='registered'?'Device registered. Background delivery is not active yet.':'Notification permission is off. You can change it in device settings.')
   }else{
    await disablePush(userId);setRegistered(false);setDesired(false);setNotice('Device registration disabled.')
   }
  }catch{setNotice(enable?'Could not register this device. Check your connection and account notification preference, then try again.':'Could not confirm removal. Retry when connected.')}
  finally{setBusy(false)}
 }
 return <View style={styles.card}>
  <Text style={styles.title}>Phone notifications</Text>
  <Text style={styles.detail}>{!configured?'Background notifications are not configured in this build. In-app activity is still available.':registered?'This phone is registered. Background delivery is not active yet.':desired?'Registration needs renewal. You can disable it or retry when connected.':'Enable account push notifications and register this phone. Registration renews when you open the app; background delivery is not active yet.'}</Text>
  {configured&&<Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={()=>void change(!desired)}>
   {busy?<ActivityIndicator color={mobileDesign.emerald}/>:<Text style={styles.buttonText}>{desired?'Disable phone notifications':'Enable phone notifications'}</Text>}
  </Pressable>}
  {configured&&desired&&!registered&&!busy&&<Pressable accessibilityRole="button" onPress={()=>void change(true)}><Text style={styles.buttonText}>Renew registration</Text></Pressable>}
  {denied&&<Pressable accessibilityRole="button" onPress={()=>void Linking.openSettings().catch(()=>setNotice('Open device settings manually.'))}><Text style={styles.buttonText}>Open device settings</Text></Pressable>}
  {!!notice&&<Text accessibilityLiveRegion="polite" style={styles.detail}>{notice}</Text>}
 </View>
}
const styles=StyleSheet.create({
 card:{padding:14,gap:8,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:16,marginBottom:20},
 title:{fontSize:15,fontWeight:'700',color:mobileDesign.ink},detail:{fontSize:13,color:mobileDesign.inkMuted,lineHeight:19},
 button:{minHeight:44,justifyContent:'center'},buttonText:{fontWeight:'700',color:mobileDesign.emerald,fontSize:14}
})
