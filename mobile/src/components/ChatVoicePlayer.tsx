import {useCallback,useRef,useState} from 'react'
import {AppState,Pressable,Text,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {Audio} from 'expo-av'
import * as FileSystem from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import {api} from '../api/client'
import {mobileDesign} from '../ui/PremiumUI'
export default function ChatVoicePlayer({messageId,userId,mime}:{messageId:string;userId:string;mime:string}){
 const [phase,setPhase]=useState<'idle'|'loading'|'playing'>('idle')
 const [error,setError]=useState('')
 const sound=useRef<Audio.Sound|null>(null)
 const file=useRef<string|null>(null)
 const revision=useRef(0)
 const focused=useRef(false)
 const cleanup=useCallback(async()=>{
  revision.current++
  const s=sound.current;sound.current=null
  if(s)await s.unloadAsync().catch(()=>{})
  const uri=file.current;file.current=null
  if(uri)await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{})
 },[])
 useFocusEffect(useCallback(()=>{
  focused.current=true
  const sub=AppState.addEventListener('change',state=>{if(state!=='active'){void cleanup();if(focused.current)setPhase('idle')}})
  return()=>{focused.current=false;sub.remove();void cleanup()}
 },[cleanup]))
 const play=async()=>{
  if(phase!=='idle')return
  const rev=++revision.current
  setPhase('loading');setError('')
  let uri:string|null=null
  let loaded:Audio.Sound|null=null
  try{
   if(!FileSystem.cacheDirectory)throw new Error('Voice playback is unavailable.')
   const result=await api.directMessages.getAttachment(messageId,userId)
   if(!focused.current||rev!==revision.current)return
   if(result.mime!==mime||!['audio/mp4','audio/webm'].includes(result.mime)||result.size<1||result.size>2097152)throw new Error('Invalid voice recording.')
   uri=FileSystem.cacheDirectory+'ievx-chat-voice-'+Crypto.randomUUID()+(mime==='audio/mp4'?'.m4a':'.webm')
   await FileSystem.writeAsStringAsync(uri,result.base64,{encoding:FileSystem.EncodingType.Base64})
   if(!focused.current||rev!==revision.current){await FileSystem.deleteAsync(uri,{idempotent:true});return}
   file.current=uri
   await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true,staysActiveInBackground:false})
   const resultSound=await Audio.Sound.createAsync({uri},{shouldPlay:false})
   loaded=resultSound.sound
   if(!focused.current||rev!==revision.current){await loaded.unloadAsync().catch(()=>{});await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});return}
   sound.current=loaded
   loaded.setOnPlaybackStatusUpdate(status=>{if(status.isLoaded&&status.didJustFinish&&focused.current&&revision.current===rev){void cleanup();setPhase('idle')}})
   await loaded.playAsync();if(focused.current&&rev===revision.current)setPhase('playing')
  }catch{
   if(loaded&&sound.current!==loaded)await loaded.unloadAsync().catch(()=>{})
   if(uri&&file.current!==uri)await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{})
   if(focused.current&&rev===revision.current){await cleanup();setPhase('idle');setError('This device could not play the recording.')}
  }
 }
 const stop=()=>{void cleanup();setPhase('idle')}
 return <View style={{gap:4,marginTop:6}}><Pressable accessibilityRole="button" disabled={phase==='loading'} onPress={phase==='playing'?stop:()=>void play()} style={{minHeight:44,paddingHorizontal:12,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:10,justifyContent:'center'}}><Text style={{fontWeight:'700',color:mobileDesign.emerald}}>{phase==='playing'?'Stop voice message':phase==='loading'?'Loading…':'Play voice message'}</Text></Pressable>{!!error&&<Text style={{fontSize:12,color:'#a73530',backgroundColor:'#fff'}}>{error}</Text>}</View>
}
