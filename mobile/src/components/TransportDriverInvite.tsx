import {useEffect,useState} from 'react'
import {Pressable,Text,View} from 'react-native'
import {api} from '../api/client'
export function TransportDriverInvite({providerId,vehicleId}:{providerId:string;vehicleId:string}){
 const [token,setToken]=useState(''),[expires,setExpires]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 useEffect(()=>{if(!expires)return;const t=setTimeout(()=>{setToken('');setNotice('Invitation expired.')},Math.max(0,Date.parse(expires)-Date.now()));return()=>clearTimeout(t)},[expires])
 async function create(){setBusy(true);setNotice('');try{const r=await api.driverAssignments.invite(providerId,vehicleId);setToken(r.token);setExpires(r.item.expiresAt)}catch(e){setNotice(e instanceof Error?e.message:'Invitation failed.')}finally{setBusy(false)}}
 return <View style={{gap:8,padding:12,borderWidth:1,borderColor:'#d8e5e0',borderRadius:12}}><Text style={{color:'#23473b'}}>Private roster invitation. Share only with your intended driver. No commercial authorization.</Text>{token?<><Text selectable style={{color:'#16382f',fontWeight:'700'}}>{token}</Text><Text style={{color:'#23473b'}}>Expires {new Date(expires).toLocaleTimeString()}. Long press to copy; code shown once.</Text><Pressable accessibilityRole="button" onPress={()=>setToken('')}><Text style={{color:'#146b50',fontWeight:'700'}}>Hide code</Text></Pressable></>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void create()}><Text style={{color:'#146b50',fontWeight:'700',paddingVertical:8}}>Create driver invitation</Text></Pressable>}{!!notice&&<Text accessibilityRole="alert" style={{color:'#23473b'}}>{notice}</Text>}</View>
}
