import {useCallback,useRef,useState} from 'react'
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {Audio} from 'expo-av'
import * as FileSystem from 'expo-file-system'
import {mobileDesign} from '../ui/PremiumUI'

type Captured={uri:string;name:string;mimeType:string;size:number}
const deleteRecording=async(uri:string|null)=>{
 if(uri&&FileSystem.cacheDirectory&&uri.startsWith(FileSystem.cacheDirectory))await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{})
}
export default function ChatVoiceRecorder({disabled,onFile,onError}:{disabled:boolean;onFile:(file:Captured)=>void;onError:(message:string)=>void}){
 const [phase,setPhase]=useState<'idle'|'permission'|'recording'>('idle')
 const [elapsed,setElapsed]=useState(0)
 const recording=useRef<Audio.Recording|null>(null)
 const revision=useRef(0)
 const focused=useRef(false)
 const finishing=useRef(false)
 const release=useCallback(async()=>{
  revision.current++
  const r=recording.current;recording.current=null
  if(r){await r.stopAndUnloadAsync().catch(()=>{});await deleteRecording(r.getURI())}
  await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true}).catch(()=>{})
 },[])
 useFocusEffect(useCallback(()=>{
  focused.current=true
  const sub=AppState.addEventListener('change',state=>{if(state!=='active'&&recording.current){void release();if(focused.current){setPhase('idle');setElapsed(0)}}})
  return()=>{focused.current=false;sub.remove();void release()}
 },[release]))
 const finish=async()=>{
  const r=recording.current
  if(!r||finishing.current)return
  finishing.current=true
  recording.current=null
  const rev=revision.current
  let uri:string|null=null
  try{
   r.setOnRecordingStatusUpdate(null)
   await r.stopAndUnloadAsync();uri=r.getURI()
   await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true})
   if(!uri||!focused.current||rev!==revision.current){await deleteRecording(uri);return}
   const info=await FileSystem.getInfoAsync(uri)
   if(!info.exists||info.size<1||info.size>2097152){await deleteRecording(uri);onError('Recording is empty or exceeds 2 MB.');return}
   if(focused.current&&rev===revision.current)onFile({uri,name:'Voice message.m4a',mimeType:'audio/mp4',size:info.size})
   else await deleteRecording(uri)
  }catch{await deleteRecording(uri??r.getURI());if(focused.current)onError('Could not finish voice recording.')}
  finally{finishing.current=false;if(focused.current&&rev===revision.current){setPhase('idle');setElapsed(0)}}
 }
 const start=async()=>{
  if(disabled||phase!=='idle'||finishing.current)return
  const rev=++revision.current
  setPhase('permission');setElapsed(0)
  let r:Audio.Recording|null=null
  try{
   const permission=await Audio.requestPermissionsAsync()
   if(!focused.current||rev!==revision.current)return
   if(!permission.granted){onError('Microphone permission is required. Enable it in device settings.');setPhase('idle');return}
   await Audio.setAudioModeAsync({allowsRecordingIOS:true,playsInSilentModeIOS:true,staysActiveInBackground:false})
   if(!focused.current||rev!==revision.current||AppState.currentState!=='active'){await Audio.setAudioModeAsync({allowsRecordingIOS:false});if(focused.current&&rev===revision.current)setPhase('idle');return}
   const result=await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
   r=result.recording
   if(!focused.current||rev!==revision.current){await r.stopAndUnloadAsync().catch(()=>{});await deleteRecording(r.getURI());await Audio.setAudioModeAsync({allowsRecordingIOS:false});return}
   recording.current=r
   r.setProgressUpdateInterval(250)
   r.setOnRecordingStatusUpdate(status=>{
    if(!focused.current||revision.current!==rev||recording.current!==r)return
    const seconds=Math.floor(status.durationMillis/1000);setElapsed(Math.min(seconds,60))
    if(seconds>=60)void finish()
   })
   setPhase('recording')
  }catch{
   if(r){await r.stopAndUnloadAsync().catch(()=>{});await deleteRecording(r.getURI())}
   await Audio.setAudioModeAsync({allowsRecordingIOS:false}).catch(()=>{})
   if(focused.current&&rev===revision.current){setPhase('idle');onError('Microphone recording failed. Check permission and try again.')}
  }
 }
 const cancel=()=>{void release();setPhase('idle');setElapsed(0)}
 const button=(label:string,action:()=>void,off=false)=><Pressable accessibilityRole="button" disabled={off} onPress={action} style={[styles.button,off&&{opacity:.5}]}><Text style={styles.label}>{label}</Text></Pressable>
 if(phase==='recording')return <View style={styles.row}><Text accessibilityLiveRegion="polite" style={styles.recording}>Recording {elapsed}s / 60s</Text>{button('Finish',()=>void finish())}{button('Cancel',cancel)}</View>
 if(phase==='permission')return button('Cancel microphone request',cancel)
 return button('Record voice',()=>void start(),disabled)
}
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},button:{minHeight:44,borderWidth:1,borderColor:mobileDesign.border,borderRadius:10,paddingHorizontal:12,justifyContent:'center',alignItems:'center',backgroundColor:'#fff'},label:{fontWeight:'700',fontSize:13,color:mobileDesign.emerald},recording:{fontSize:13,fontWeight:'700',color:'#a73530'}})
