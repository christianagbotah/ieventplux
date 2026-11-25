import {useCallback,useEffect,useRef,useState} from 'react'
import {Pressable,StyleSheet,Text,View} from 'react-native'
import {api,formatMinor,type EventDetail,type SouvenirRequestItem} from '../api/client'
import {theme} from '../theme'
export function SouvenirRequests({event}:{event:EventDetail}){
 const [data,setData]=useState<{items:SouvenirRequestItem[];manager:boolean}|null>(null)
 const [selected,setSelected]=useState('')
 const [quantity,setQuantity]=useState(1)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const retry=useRef(new Map<string,string>())
 const load=useCallback(async()=>{try{setData(await api.souvenirs.requests(event.id))}catch(e){setMessage(e instanceof Error?e.message:'Requests unavailable.')}},[event.id])
 useEffect(()=>{void load()},[load])
 const product=event.souvenirs?.find(p=>p.id===selected)
 async function send(){
  if(!product)return
  const fingerprint=JSON.stringify([product.id,quantity,product.priceMinor])
  if(!retry.current.has(fingerprint))retry.current.set(fingerprint,'request-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2))
  setBusy(true);setMessage('')
  try{await api.souvenirs.create(event.id,{productId:product.id,quantity,expectedUnitPriceMinor:product.priceMinor,requestKey:retry.current.get(fingerprint)!});retry.current.delete(fingerprint);setSelected('');setQuantity(1);setMessage('Request sent. No payment or stock reservation.');await load()}catch(e){setMessage(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}
 }
 async function decide(id:string,status:string){setBusy(true);setMessage('');try{await api.souvenirs.decide(event.id,id,status);await load()}catch(e){setMessage(e instanceof Error?e.message:'Update failed.')}finally{setBusy(false)}}
 return <View style={styles.panel}><Text style={styles.title}>{data?.manager?'Incoming merchandise requests':'Merchandise requests'}</Text><Text style={styles.body}>No payment or stock reservation is made.</Text>
 {!!message&&<Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
 {data&&!data.manager&&['PUBLISHED','LIVE','POSTPONED'].includes(event.status)&&<>{event.souvenirs?.filter(p=>p.available>0).map(p=><Pressable key={p.id} disabled={busy} onPress={()=>{setSelected(p.id);setQuantity(1)}} style={[styles.choice,selected===p.id&&{borderColor:theme.colors.primary}]}><Text style={styles.body}>{p.name} · {formatMinor(p.priceMinor)} {selected===p.id?'✓':''}</Text></Pressable>)}
 {product&&<><View style={styles.row}><Pressable disabled={busy||quantity<=1} onPress={()=>setQuantity(q=>q-1)} style={styles.choice}><Text style={styles.body}>−</Text></Pressable><Text style={styles.body}>{quantity}</Text><Pressable disabled={busy||quantity>=Math.min(20,product.available)} onPress={()=>setQuantity(q=>q+1)} style={styles.choice}><Text style={styles.body}>+</Text></Pressable></View><Text style={styles.body}>Total: {formatMinor(quantity*product.priceMinor)}</Text><Pressable disabled={busy} onPress={()=>void send()} style={styles.choice}><Text style={styles.body}>{busy?'Submitting…':'Send purchase request'}</Text></Pressable></>}</>}
 {data?.items.map(i=><View key={i.id} style={styles.choice}><Text style={styles.body}>{i.productName} · {i.quantity} · {formatMinor(i.totalMinor)}</Text><Text style={styles.body}>{i.status} · not paid</Text>{data.manager&&i.status==='REQUESTED'&&<Pressable disabled={busy} onPress={()=>void decide(i.id,'ACKNOWLEDGED')}><Text style={styles.action}>Acknowledge</Text></Pressable>}{['REQUESTED','ACKNOWLEDGED'].includes(i.status)&&<Pressable disabled={busy} onPress={()=>void decide(i.id,data.manager?'DECLINED':'WITHDRAWN')}><Text style={styles.action}>{data.manager?'Decline':'Withdraw'}</Text></Pressable>}</View>)}
 </View>
}
const styles=StyleSheet.create({panel:{padding:16,gap:10,borderWidth:1,borderColor:'#829197',borderRadius:16,marginVertical:12},title:{fontSize:18,fontWeight:'700',color:theme.colors.primary},body:{fontSize:14,color:theme.colors.text},choice:{padding:12,borderWidth:1,borderColor:'#829197',borderRadius:10,gap:6},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},action:{color:theme.colors.primary,paddingVertical:8,fontWeight:'600'}})
