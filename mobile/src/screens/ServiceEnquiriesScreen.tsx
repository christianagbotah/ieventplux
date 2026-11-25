import {useCallback,useEffect,useRef,useState} from 'react'
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native'
import type {NativeStackScreenProps} from '@react-navigation/native-stack'
import type {RootStackParamList} from '../navigation'
import {api,type ServiceEnquiry} from '../api/client'
import {useSession} from '../store/session'
import {ServiceAppointments} from '../components/ServiceAppointments'
import {PremiumBackdrop,mobileDesign,SectionHeading} from '../ui/PremiumUI'
const minor=(s:string)=>/^\d{1,7}(\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):0
const money=(n:number)=>'₵'+(n/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
export default function ServiceEnquiriesScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'ServiceEnquiries'>){
 const {user}=useSession()
 const providerId=route.params?.providerId??''
 const [items,setItems]=useState<ServiceEnquiry[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [description,setDescription]=useState(''),[community,setCommunity]=useState(''),[selected,setSelected]=useState(''),[price,setPrice]=useState(''),[note,setNote]=useState('')
 const retry=useRef(new Map<string,string>())
 const refresh=useCallback(async()=>{try{setItems((await api.serviceEnquiries.list()).items)}catch(e){setItems([]);setMessage(e instanceof Error?e.message:'Enquiries unavailable')}},[])
 useEffect(()=>{setItems([]);if(user)void refresh()},[user?.id,refresh])
 async function send(){
  const fingerprint=JSON.stringify([providerId,community.trim(),description.trim()])
  if(!retry.current.has(fingerprint))retry.current.set(fingerprint,'enquiry-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2))
  setBusy(true);setMessage('')
  try{await api.serviceEnquiries.create({providerId,community,description,requestKey:retry.current.get(fingerprint)!});retry.current.delete(fingerprint);setCommunity('');setDescription('');navigation.setParams({providerId:undefined,providerName:undefined});await refresh();setMessage('Enquiry sent. No payment or booking has been made.')}catch(e){setMessage(e instanceof Error?e.message:'Enquiry failed')}finally{setBusy(false)}
 }
 async function decide(id:string,action:string){setBusy(true);setMessage('');try{await api.serviceEnquiries.decide(id,action==='QUOTE'?{action,quoteMinor:minor(price),quoteNote:note}:{action});setSelected('');setPrice('');setNote('');await refresh();setMessage('Decision saved. No payment or booking.')}catch(e){setMessage(e instanceof Error?e.message:'Decision failed')}finally{setBusy(false)}}
 const button=(label:string,fn:()=>void,disabled=busy)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={fn} style={[styles.button,disabled&&{opacity:.45}]}><Text style={styles.buttonText}>{label}</Text></Pressable>
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.hero}><PremiumBackdrop mode="ocean"/><Text style={styles.title}>Service enquiries</Text><Text style={styles.heroBody}>Request a quote, review the scope and respond privately. Quotes expire after 24 hours; no booking or payment is activated.</Text></View>
 {!!message&&<Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
 {!user?<Text style={styles.body}>Sign in to manage enquiries.</Text>:<>
 {providerId&&<View style={styles.card}><Text style={styles.heading}>Request a quotation</Text><Text style={styles.body}>{route.params?.providerName||'Selected service provider'}</Text><TextInput style={styles.input} value={community} onChangeText={setCommunity} maxLength={100} placeholder="Community or town" accessibilityLabel="Community or town" placeholderTextColor="#64748b"/><TextInput multiline style={[styles.input,{minHeight:100,textAlignVertical:'top'}]} value={description} onChangeText={setDescription} maxLength={1000} placeholder="Describe the work needed" accessibilityLabel="Service description" placeholderTextColor="#64748b"/><Text style={styles.body}>Do not include private addresses, phone numbers, medical details or identity documents.</Text>{button('Send private enquiry',()=>void send(),busy||community.trim().length<2||description.trim().length<10)}</View>}
 <SectionHeading eyebrow="YOUR WORKSPACE" title="Incoming and outgoing enquiries" subtitle="Private quote history"/>{button('Refresh enquiries',()=>void refresh())}{items.length===0&&<Text style={styles.body}>No enquiries yet.</Text>}
 {items.map(r=><View key={r.id} style={styles.card}><Text style={styles.heading}>{r.role==='CUSTOMER'?r.provider.displayName:r.customer.displayName}</Text><Text style={styles.body}>{r.community} · {r.status.toLowerCase().replace(/_/g,' ')}</Text><Text style={styles.body}>{r.description}</Text>{r.quoteMinor!==null&&<View style={styles.quote}><Text style={styles.heading}>{money(r.quoteMinor)}</Text><Text style={styles.body}>{r.quoteNote}</Text><Text style={styles.body}>Expires: {r.quoteExpiresAt?new Date(r.quoteExpiresAt).toLocaleString():'Unknown'}</Text></View>}
 {r.role==='PROVIDER'&&r.status==='REQUESTED'&&(selected===r.id?<><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" accessibilityLabel="Quoted price in Ghana cedis" placeholder="Price (₵)" placeholderTextColor="#64748b" style={styles.input}/><TextInput value={note} onChangeText={setNote} maxLength={500} multiline accessibilityLabel="Quotation scope" placeholder="What the price includes" placeholderTextColor="#64748b" style={styles.input}/>{button('Send quotation',()=>void decide(r.id,'QUOTE'),busy||minor(price)<1||minor(price)>100000000||note.trim().length<2)}</>:<>{button('Prepare quotation',()=>{setSelected(r.id);setPrice('');setNote('')})}{button('Decline enquiry',()=>void decide(r.id,'DECLINE'))}</>)}
 {r.role==='CUSTOMER'&&r.status==='QUOTED'&&<>{button('Accept quote (non-binding)',()=>void decide(r.id,'ACCEPT_QUOTE'),busy||!r.quoteExpiresAt||Date.parse(r.quoteExpiresAt)<=Date.now())}{button('Decline quote',()=>void decide(r.id,'DECLINE_QUOTE'))}</>}
 {r.role==='CUSTOMER'&&['REQUESTED','QUOTED'].includes(r.status)&&button('Withdraw enquiry',()=>void decide(r.id,'WITHDRAW'))}</View>)}<ServiceAppointments key={user.id} enquiries={items}/></>}</ScrollView>
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,paddingBottom:40,gap:14},hero:{backgroundColor:mobileDesign.forest,borderRadius:24,overflow:'hidden',padding:24,gap:12},title:{color:'#fff',fontSize:28,fontWeight:'900'},heroBody:{color:'#ddf5ed',fontSize:14,lineHeight:22},card:{backgroundColor:'#fff',borderColor:'#d8e5e0',borderWidth:1,borderRadius:18,padding:16,gap:12},heading:{color:'#16382f',fontSize:19,fontWeight:'800'},body:{fontSize:14,color:'#23473b',lineHeight:21},quote:{backgroundColor:'#edf4f1',borderRadius:12,padding:12,gap:6},input:{color:'#16382f',borderWidth:1,borderColor:'#d8e5e0',borderRadius:12,padding:12,minHeight:48},button:{backgroundColor:'#146b50',borderRadius:12,padding:14,minHeight:46,justifyContent:'center'},buttonText:{color:'#fff',fontSize:14,fontWeight:'700'}})
