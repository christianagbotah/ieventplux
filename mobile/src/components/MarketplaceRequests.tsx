import {useCallback,useEffect,useRef,useState} from 'react'
import {Pressable,StyleSheet,Text,View} from 'react-native'
import {api,formatMinor} from '../api/client'
import {ActionDialog} from './ActionDialog'
import {mobileDesign} from '../ui/PremiumUI'
import {purchaseRequestBody,purchaseRequestFingerprint,requestStatusLabel,availableRequestDecisions,decisionLabel,type RequestDecision,type ReviewedBasket,type PurchaseRequestHistory} from '../lib/marketplace-requests'

export function MarketplaceRequests({slug,seller,quote,onSubmitted}:{slug:string;seller:boolean;quote:ReviewedBasket|null;onSubmitted:(submitted:ReviewedBasket)=>void}){
 const [history,setHistory]=useState<PurchaseRequestHistory|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [submissionError,setSubmissionError]=useState('')
 const [notice,setNotice]=useState('')
 const [submitting,setSubmitting]=useState(false)
 const [pending,setPending]=useState<ReviewedBasket|null>(null)
 const [decision,setDecision]=useState<{id:string;status:RequestDecision}|null>(null)
 const locked=useRef(false)
 const active=useRef(true)
 const epoch=useRef(0)
 const retry=useRef(new Map<string,string>())
 const load=useCallback(async()=>{
  const generation=++epoch.current;setLoading(true);setError('')
  try{const result=await api.marketplace.purchaseRequests(slug)
   if(generation===epoch.current){if(result.seller!==seller)throw new Error('Session changed. Refresh the storefront.');setHistory(result)}
  }catch(e){if(generation===epoch.current){setHistory(null);setError(e instanceof Error?e.message:'Could not load requests.')}}
  finally{if(generation===epoch.current)setLoading(false)}
 },[slug,seller])
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;epoch.current++}},[load])
 async function submit(){
  if(!pending||seller||locked.current)return
  locked.current=true;setSubmitting(true);setSubmissionError('');setNotice('')
  try{
   const fingerprint=purchaseRequestFingerprint(pending)
   // Idempotency identifier, not an authentication or security token.
   if(!retry.current.has(fingerprint))retry.current.set(fingerprint,'request-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2))
   const result=await api.marketplace.createPurchaseRequest(slug,purchaseRequestBody(pending,retry.current.get(fingerprint)!))
   if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('Unexpected purchase request response.')
   if(!active.current)return
   retry.current.delete(fingerprint);setNotice('Purchase request received. Reference: '+result.request.id);onSubmitted(pending);await load()
  }catch(e){if(active.current)setSubmissionError(e instanceof Error?e.message:'Could not submit. Retry with the same reviewed basket.')}
  finally{locked.current=false;if(active.current){setPending(null);setSubmitting(false)}}
 }
 async function decide(){
  if(!decision||locked.current)return
  locked.current=true;setSubmitting(true);setSubmissionError('');setNotice('')
  try{
   const result=await api.marketplace.decidePurchaseRequest(decision.id,decision.status)
   if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('Unexpected purchase request response.')
   if(!active.current)return
   setNotice(requestStatusLabel(result.request.status));await load()
  }catch(e){if(active.current){setSubmissionError(e instanceof Error?e.message:'Could not update request.');await load()}}
  finally{locked.current=false;if(active.current){setDecision(null);setSubmitting(false)}}
 }
 return <View style={styles.panel}>
  <Text style={styles.eyebrow}>MARKETPLACE REQUESTS</Text>
  <Text accessibilityRole="header" style={styles.title}>{seller?'Incoming purchase requests':'Your purchase requests'}</Text>
  <Text style={styles.muted}>Non-binding requests only. No payment or inventory is reserved.</Text>
  {!seller&&quote?<Pressable accessibilityRole="button" disabled={submitting} style={styles.primary} onPress={()=>setPending(quote)}><Text style={styles.primaryText}>Submit purchase request · {formatMinor(quote.totalMinor,'GHS')}</Text></Pressable>:null}
  {!seller&&!quote?<Text style={styles.muted}>Review your basket to submit a new request.</Text>:null}
  {submissionError?<Text accessibilityRole="alert" style={styles.error}>{submissionError}</Text>:null}
  {notice?<Text accessibilityLiveRegion="polite" style={styles.muted}>{notice}</Text>:null}
  <Pressable accessibilityRole="button" disabled={loading} style={styles.secondary} onPress={()=>void load()}><Text style={styles.secondaryText}>{loading?'Refreshing…':'Refresh requests'}</Text></Pressable>
  {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
  {history&&history.requests.length===0?<Text style={styles.muted}>No requests yet.</Text>:null}
  {history?.requests.map(row=><View key={row.id} style={styles.request}>
   <Text style={styles.amount}>{formatMinor(row.totalMinor,row.currency)}</Text><Text style={styles.muted}>{requestStatusLabel(row.status)}</Text>
   <Text style={styles.muted}>{new Date(row.createdAt).toLocaleString()} · {row.id}</Text>
   {row.items.map(item=><View key={item.variantId} style={styles.line}><Text style={[styles.muted,{flex:1}]}>{item.productName} · {item.variantTitle} × {item.quantity}</Text><Text style={styles.secondaryText}>{formatMinor(item.lineMinor,item.currency)}</Text></View>)}
   {availableRequestDecisions(seller,row.status).map(action=><Pressable key={action} accessibilityRole="button" disabled={submitting||loading} style={action==='ACKNOWLEDGED'?styles.primary:styles.secondary} onPress={()=>setDecision({id:row.id,status:action})}><Text style={action==='ACKNOWLEDGED'?styles.primaryText:styles.secondaryText}>{decisionLabel(action)}</Text></Pressable>)}
  </View>)}
  {history&&history.requests.length===50?<Text style={styles.muted}>Showing the latest 50 requests.</Text>:null}
  <ActionDialog prompt={decision?{title:decisionLabel(decision.status)+'?',description:'This changes request status only. No order confirmation, stock reservation or payment is created.',confirmLabel:decisionLabel(decision.status),onConfirm:()=>void decide()}:pending?{title:'Submit purchase request?',description:'Send this reviewed merchandise selection to the seller. No payment, stock reservation or confirmed order is created.',confirmLabel:'Submit request',onConfirm:()=>void submit()}:null} busy={submitting} onDismiss={()=>{setPending(null);setDecision(null)}}/>
 </View>
}
const styles=StyleSheet.create({
 panel:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:23,padding:19,gap:12},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:mobileDesign.emerald},title:{fontSize:19,fontWeight:'900',color:mobileDesign.ink},
 muted:{fontSize:12,lineHeight:19,color:mobileDesign.inkMuted},error:{color:'#b34843',fontSize:12,lineHeight:19},
 primary:{minHeight:52,borderRadius:15,backgroundColor:mobileDesign.emerald,justifyContent:'center',alignItems:'center',padding:12},primaryText:{fontWeight:'900',color:'#fff',fontSize:13,textAlign:'center'},
 secondary:{minHeight:48,borderRadius:15,borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',justifyContent:'center'},secondaryText:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},
 request:{borderRadius:16,borderWidth:1,borderColor:mobileDesign.border,padding:13,gap:7},amount:{fontSize:18,fontWeight:'900',color:mobileDesign.ink},line:{flexDirection:'row',alignItems:'center',gap:10},
})
