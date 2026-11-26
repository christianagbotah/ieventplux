import {useCallback,useRef,useState} from 'react'
import {Modal,Pressable,StyleSheet,Text,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {api,formatDateTime,type PushDevice} from '../api/client'
import {mobileDesign} from '../ui/PremiumUI'
import {refreshPush} from '../lib/push-registration'
type Result={accountEnabled:boolean;deliveryEnabled:boolean;hasMore:boolean;items:PushDevice[]}
export default function PushDeviceManager({userId}:{userId:string}){
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(''),[target,setTarget]=useState<PushDevice|null>(null),[busy,setBusy]=useState(false)
 const active=useRef(false),rev=useRef(0),acting=useRef(false)
 const load=useCallback(async()=>{
  const v=++rev.current
  try{const result=await api.notifications.devices(userId);if(active.current&&rev.current===v){setData(result);setError('')}}
  catch{if(active.current&&rev.current===v){setData(null);setError('Could not load registered phones. Try again.')}}
 },[userId])
 useFocusEffect(useCallback(()=>{active.current=true;void load();return()=>{active.current=false;rev.current++}},[load]))
 const remove=async()=>{
  if(!target||!active.current||acting.current)return
  acting.current=true;setBusy(true);setError('')
  try{
   await api.notifications.removeDevice(userId,target.id)
   if(active.current){setTarget(null);await load();if(target.currentSession)void refreshPush(userId).catch(()=>{})}
  }catch{if(active.current)setError('Could not confirm removal. Refresh and retry.')}
  finally{acting.current=false;if(active.current)setBusy(false)}
 }
 const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" onPress={action} disabled={disabled} style={[styles.button,disabled&&{opacity:.5}]}><Text style={styles.link}>{label}</Text></Pressable>
 return <View style={styles.card}><View style={styles.row}><Text style={styles.title}>Registered phones</Text>{button('Refresh',()=>void load(),busy)}</View><Text style={styles.copy}>Remove a phone you no longer use. This does not sign it out.</Text>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {!data&&!error&&<Text style={styles.copy}>Loading registered phones…</Text>}
  {data&&<><Text style={styles.copy}>Account alerts {data.accountEnabled?'enabled':'disabled'} · Background delivery {data.deliveryEnabled?'available':'not active'}</Text>
   {data.items.length===0?<Text style={styles.copy}>No registered phones.</Text>:data.items.map(row=><View style={styles.device} key={row.id}><View style={{flex:1}}><Text style={styles.title}>{row.platform==='IOS'?'iPhone':'Android phone'}{row.currentSession?' · Current session':''}</Text><Text style={styles.copy}>{row.registrationCurrent?'Registration current':'Renewal required'} · {formatDateTime(row.lastUpdatedAt)}</Text></View>{button('Remove',()=>setTarget(row),busy)}</View>)}
   {data.hasMore&&<Text style={styles.copy}>Showing the 50 most recent registrations. Remove unwanted entries and refresh.</Text>}
  </>}
  <Modal visible={!!target} transparent animationType="fade" onRequestClose={()=>{if(!busy)setTarget(null)}}><View style={styles.backdrop}><View style={styles.card} accessibilityViewIsModal><Text style={styles.title}>Remove phone notifications?</Text><Text style={styles.copy}>This revokes the selected registration. The phone must explicitly register again to receive alerts. It does not sign the phone out.</Text>{!!error&&<Text style={styles.error}>{error}</Text>}<View style={styles.row}>{button('Cancel',()=>setTarget(null),busy)}{button('Remove registration',()=>void remove(),busy)}</View></View></View></Modal>
 </View>
}
const styles=StyleSheet.create({card:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:mobileDesign.border,padding:14,gap:10,marginBottom:16},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8},title:{fontWeight:'700',fontSize:14,color:mobileDesign.ink},copy:{fontSize:12,lineHeight:18,color:mobileDesign.inkMuted},link:{fontWeight:'700',color:mobileDesign.emerald,fontSize:13},button:{minHeight:44,paddingHorizontal:8,justifyContent:'center'},device:{flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderColor:mobileDesign.border,paddingTop:8},error:{fontSize:12,color:'#a73530'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'center',padding:24}})
