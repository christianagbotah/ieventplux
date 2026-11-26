import {useCallback,useRef,useState} from 'react'
import {ActivityIndicator,AppState,FlatList,KeyboardAvoidingView,Modal,Platform,Pressable,RefreshControl,StyleSheet,Switch,Text,TextInput,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import type {NativeStackScreenProps} from '@react-navigation/native-stack'
import type {RootStackParamList} from '../navigation'
import {api,formatDateTime,type DirectContact,type DirectConversation,type DirectDetail,type DirectMessage} from '../api/client'
import {useSession} from '../store/session'
import {mobileDesign} from '../ui/PremiumUI'
import {subscribeActivity} from '../lib/activity-signal'
import ChatVoiceRecorder from '../components/ChatVoiceRecorder'
import ChatVoicePlayer from '../components/ChatVoicePlayer'
import {loadPendingText,savePendingText,clearPendingText} from '../lib/direct-pending'
import {MAX_PENDING_AGE,type PendingText} from '../lib/direct-pending-policy'

type Props=NativeStackScreenProps<RootStackParamList,'DirectMessages'>
export default function DirectMessagesScreen(props:Props){
 const {status,user}=useSession()
 if(status!=='authenticated'||!user)return <View style={styles.center}><Text style={styles.title}>Sign in to view messages.</Text><Action label="Sign in" onPress={()=>props.navigation.navigate('Login')}/></View>
 return <Inbox key={user.id+':'+(props.route.params?.id??'inbox')} userId={user.id} {...props}/>
}
function Action({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button,secondary&&styles.secondary,disabled&&{opacity:.5}]} onPress={onPress}><Text style={[styles.buttonText,secondary&&styles.secondaryText]}>{label}</Text></Pressable>
}
function Inbox({userId,route,navigation}:Props&{userId:string}){
 const id=route.params?.id
 const [rows,setRows]=useState<DirectConversation[]>([])
 const [contacts,setContacts]=useState<DirectContact[]|null>(null)
 const [query,setQuery]=useState('')
 const [detail,setDetail]=useState<DirectDetail|null>(null)
 const [older,setOlder]=useState<DirectMessage[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [page,setPage]=useState(1)
 const [hasMore,setHasMore]=useState(false)
 const [draft,setDraft]=useState('')
 const [pendingText,setPendingText]=useState<PendingText|null>(null)
 const [pendingReady,setPendingReady]=useState(false)
 const [receiptStatus,setReceiptStatus]=useState('')
 const [discardPending,setDiscardPending]=useState(false)
 const sending=useRef(false)
 const pending=useRef<PendingText|null>(null)
 useFocusEffect(useCallback(()=>{
  if(!id)return
  let alive=true
  setPendingReady(false)
  void loadPendingText(userId,id).then(record=>{
   if(alive){pending.current=record;setPendingText(record);if(record)setDraft(record.body);setPendingReady(true)}
  }).catch(()=>{if(alive){setPendingReady(false);setError('Secure pending-message storage is unavailable. Reopen this conversation to retry.')}})
  return()=>{alive=false}
 },[id,userId]))
 const [attachmentEnabled,setAttachmentEnabled]=useState(false)
 const [file,setFile]=useState<{uri:string;name:string;mimeType:string;size?:number}|null>(null)
 const pendingFile=useRef<{uri:string;caption:string;key:string}|null>(null)
 useFocusEffect(useCallback(()=>{
  if(!id)return
  let alive=true
  void api.directMessages.attachmentConfig().then(result=>{if(alive)setAttachmentEnabled(result.enabled)}).catch(()=>{})
  return()=>{alive=false}
 },[id]))
 const [reportTarget,setReportTarget]=useState<string|null>(null)
 const [safetyTarget,setSafetyTarget]=useState<'block'|'mute'|null>(null)
 const [reportReason,setReportReason]=useState('SPAM')
 const [reportDetails,setReportDetails]=useState('')
 const [reportStatus,setReportStatus]=useState('')
 const [reported,setReported]=useState<string[]>([])
 const [shareActivity,setShareActivity]=useState(false)
 const [peerActivity,setPeerActivity]=useState({active:false,typing:false})
 const lastTyping=useRef(0)
 const canShare=detail?.conversation.canSend===true
 useFocusEffect(useCallback(()=>{
  if(!id||!canShare)return
  let alive=true,inFlight=false
  const tick=async()=>{
   if(!alive||inFlight||AppState.currentState!=='active')return
   inFlight=true
   try{
    const result=await api.directMessages.activity({id,expectedUserId:userId,share:shareActivity,typing:shareActivity&&Date.now()-lastTyping.current<6000})
    if(alive)setPeerActivity(result)
   }catch{if(alive)setPeerActivity({active:false,typing:false})}
   finally{inFlight=false}
  }
  void tick()
  const timer=setInterval(()=>void tick(),4000)
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void tick()})
  return()=>{alive=false;clearInterval(timer);sub.remove()}
 },[id,canShare,shareActivity,userId]))

 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(false)
 const [loaded,setLoaded]=useState(false)
 const active=useRef(false)
 const revision=useRef(0)
 const loadingRef=useRef(false)
 const lastRead=useRef('')
 const historyStarted=useRef(false)
 const load=useCallback(async(next=1)=>{
  if(!active.current||loadingRef.current)return
  loadingRef.current=true
  const rev=++revision.current
  setLoading(true)
  const current=()=>active.current&&rev===revision.current
  try{
   if(id){
    const result=await api.directMessages.detail(id)
    if(!current())return
    setDetail(result);if(!historyStarted.current)setCursor(result.nextCursor)
    const unread=result.items.find(m=>m.senderId!==userId&&!m.readAt)
    if(unread&&lastRead.current!==unread.id&&AppState.currentState==='active'){
     lastRead.current=unread.id
     void api.directMessages.mutate({action:'read',id,throughId:unread.id,expectedUserId:userId}).catch(()=>{lastRead.current=''})
    }
   }else{
    const result=await api.directMessages.list(next)
    if(!current())return
    setRows(result.items);setPage(next);setHasMore(result.hasMore)
   }
   setLoaded(true)
  }catch(err){if(current())setError(err instanceof Error?err.message:'Could not load messages.')}
  finally{if(current()){setLoading(false);loadingRef.current=false}}
 },[id,userId])
 useFocusEffect(useCallback(()=>{
  active.current=true;loadingRef.current=false
  void load()
  const refresh=()=>{if(AppState.currentState==='active')void load()}
  const sub=subscribeActivity(userId,refresh)
  const timer=setInterval(refresh,5000)
  return()=>{active.current=false;revision.current++;loadingRef.current=false;sub();clearInterval(timer)}
 },[load,userId]))
 const mutate=async(data:Record<string,unknown>)=>{
  if(!active.current||busy)return
  setBusy(true);setError('')
  try{
   const result=await api.directMessages.mutate({...data,expectedUserId:userId})
   if(!active.current)return
   if(data.action==='request'&&result.conversation){navigation.push('DirectMessages',{id:result.conversation.id});return}
   if(data.action==='send'){pending.current=null;setPendingText(null);lastTyping.current=0;setDraft('')}
   await load()
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not complete action.')}
  finally{if(active.current)setBusy(false)}
 }
 const search=async()=>{
  setBusy(true);setError('')
  try{const result=await api.directMessages.contacts(query);if(active.current)setContacts(result.items)}
  catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not find contacts.')}
  finally{if(active.current)setBusy(false)}
 }
 const submitReport=async()=>{
  if(!reportTarget||busy||!active.current)return
  setBusy(true);setError('')
  try{
   await api.directMessages.mutate({action:'report',id,messageId:reportTarget,reason:reportReason,details:reportDetails,expectedUserId:userId})
   if(active.current){setReported(v=>[...v,reportTarget]);setReportStatus('Report submitted to moderation.');setReportTarget(null)}
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not submit report.')}
  finally{if(active.current)setBusy(false)}
 }
 const pickFile=async()=>{
  if(busy||file||pending.current)return
  setError('')
  try{
   const picker=await import('expo-document-picker')
   const result=await picker.getDocumentAsync({type:['image/jpeg','image/png','image/webp','application/pdf'],multiple:false,copyToCacheDirectory:true})
   if(result.canceled||!active.current)return
   const picked=result.assets[0]
   if(!picked?.mimeType||!['image/jpeg','image/png','image/webp','application/pdf'].includes(picked.mimeType)||picked.size===undefined||picked.size>2097152||picked.size<1){setError('Choose a supported file no larger than 2 MB.');return}
   setFile({uri:picked.uri,name:picked.name,mimeType:picked.mimeType,size:picked.size})
  }catch{if(active.current)setError('Could not open file picker.')}
 }
 const sendFile=async()=>{
  if(!file||!id||busy||!active.current)return
  if(pending.current){setError('Retry the previous text message first.');return}
  const caption=draft.trim()
  if(pendingFile.current&&(pendingFile.current.uri!==file.uri||pendingFile.current.caption!==caption)){setError('Retry the original attachment and caption first.');return}
  setBusy(true);setError('')
  try{
   if(!pendingFile.current){const crypto=await import('expo-crypto');pendingFile.current={uri:file.uri,caption,key:crypto.randomUUID()}}
   const form=new FormData()
   form.append('id',id);form.append('expectedUserId',userId);form.append('clientKey',pendingFile.current.key);form.append('caption',caption)
   // React Native FormData accepts the file URI descriptor, not a browser File.
   form.append('file',{uri:file.uri,name:file.name,type:file.mimeType} as unknown as Blob)
   await api.directMessages.uploadAttachment(form)
   pendingFile.current=null
   if(active.current){setFile(null);setDraft('');lastTyping.current=0;await load()}
   const fs=await import('expo-file-system')
   if(fs.cacheDirectory&&file.uri.startsWith(fs.cacheDirectory))await fs.deleteAsync(file.uri,{idempotent:true}).catch(()=>{})
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not send attachment. Retry with the same file.')}
  finally{if(active.current)setBusy(false)}
 }
 const openFile=async(messageId:string)=>{
  if(busy||!active.current)return
  setBusy(true);setError('')
  let temp:string|undefined
  try{
   const sharing=await import('expo-sharing'),fs=await import('expo-file-system'),crypto=await import('expo-crypto')
   if(!fs.cacheDirectory||!await sharing.isAvailableAsync())throw new Error('File sharing is not available on this device.')
   const result=await api.directMessages.getAttachment(messageId,userId)
   if(!active.current)return
   if(!['image/webp','application/pdf'].includes(result.mime)||result.size>2097152)throw new Error('Unsupported attachment.')
   temp=fs.cacheDirectory+'ievx-chat-'+crypto.randomUUID()+(result.mime==='application/pdf'?'.pdf':'.webp')
   await fs.writeAsStringAsync(temp,result.base64,{encoding:fs.EncodingType.Base64})
   if(active.current)await sharing.shareAsync(temp,{mimeType:result.mime,dialogTitle:result.filename})
  }catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not open attachment.')}
  finally{
   if(temp){const fs=await import('expo-file-system');await fs.deleteAsync(temp,{idempotent:true}).catch(()=>{})}
   if(active.current)setBusy(false)
  }
 }
 const reconcileText=async(retry:boolean,create=false)=>{
  if(!id||busy||sending.current||!active.current||!pendingReady)return
  sending.current=true;setBusy(true);setError('');setReceiptStatus('')
  try{
   let record=pending.current
   if(!record&&create){
    const body=draft.trim()
    if(!body)return
    const crypto=await import('expo-crypto')
    record={userId,conversationId:id,body,key:crypto.randomUUID(),createdAt:Date.now()}
    await savePendingText(record)
    pending.current=record
    if(active.current)setPendingText(record)
   }
   if(!record||!active.current)return
   const receipt=await api.directMessages.receipt(id,userId,record.key)
   if(!active.current)return
   if(!receipt.found&&!retry){setReceiptStatus('No server receipt yet. Retry uses the same message key.');return}
   if(!receipt.found&&Date.now()-record.createdAt>MAX_PENDING_AGE){setReceiptStatus('The pending retry has expired. Check delivery or discard the local copy.');return}
   if(!receipt.found)await api.directMessages.mutate({action:'send',id,body:record.body,clientKey:record.key,expectedUserId:userId})
   await clearPendingText(userId,id)
   pending.current=null
   if(active.current){setPendingText(null);setDraft('');lastTyping.current=0;setReceiptStatus(receipt.status==='REMOVED'?'Message was received and later removed.':'Message saved on server.');await load()}
  }catch(err){if(active.current)setError((err instanceof Error?err.message:'Could not confirm delivery.')+(pending.current?' Pending text is saved securely on this device.':' Message was not queued.'))}
  finally{sending.current=false;setBusy(false)}
 }
 const send=async()=>{
  if(file){await sendFile();return}
  if(!pending.current)await reconcileText(true,true)
 }
 const more=async()=>{
  if(!id||!cursor||busy)return
  setBusy(true);setError('')
  try{const result=await api.directMessages.detail(id,cursor);if(active.current){historyStarted.current=true;setOlder(v=>[...v,...result.items]);setCursor(result.nextCursor)}}
  catch(err){if(active.current)setError(err instanceof Error?err.message:'Could not load history.')}
  finally{if(active.current)setBusy(false)}
 }
 const feedback=error?<View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Action secondary label="Refresh" onPress={()=>{setError('');void load(page)}}/></View>:null
 if(!id)return <FlatList style={styles.screen} contentContainerStyle={styles.content} data={rows} keyExtractor={r=>r.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()}/>}
  ListHeaderComponent={<View style={styles.stack}><Text style={styles.heading}>Messages</Text><Text style={styles.muted}>Private conversations</Text>{feedback}<View style={styles.row}><TextInput style={[styles.input,{flex:1}]} value={query} onChangeText={setQuery} placeholder="Find a connection" placeholderTextColor={mobileDesign.inkMuted} accessibilityLabel="Find a connection"/><Action label="Search" secondary disabled={busy} onPress={()=>void search()}/></View>{contacts!==null&&<View style={styles.card}><Text style={styles.title}>Your connections</Text>{contacts.length===0?<Text style={styles.muted}>No matching connections.</Text>:contacts.map(p=><Pressable key={p.id} style={styles.contact} disabled={busy} onPress={()=>void mutate({action:'request',userId:p.id})}><Text style={styles.title}>{p.displayName}</Text><Text style={styles.link}>Message ›</Text></Pressable>)}</View>}</View>}
  ListEmptyComponent={!loaded&&loading?<ActivityIndicator color={mobileDesign.emerald}/>:loaded?<Text style={styles.muted}>No conversations yet. Find a connection to start.</Text>:null}
  renderItem={({item})=><Pressable style={styles.contact} accessibilityRole="button" onPress={()=>navigation.push('DirectMessages',{id:item.id})}><View style={styles.avatar}><Text style={styles.link}>{(item.peer?.displayName??'M').slice(0,1).toUpperCase()}</Text></View><View style={{flex:1}}><Text numberOfLines={1} style={styles.title}>{item.peer?.displayName??'Member'}</Text><Text style={styles.muted}>{item.status==='PENDING'?'Message request':item.status==='DECLINED'?'Request declined':'Private conversation'}</Text></View>{!!item.unread&&<View style={styles.badge}><Text style={styles.buttonText}>{item.unread}</Text></View>}</Pressable>}
  ListFooterComponent={hasMore||page>1?<View style={styles.row}><Action label="Previous" secondary disabled={page<=1||loading} onPress={()=>void load(page-1)}/><Action label="Next" secondary disabled={!hasMore||loading} onPress={()=>void load(page+1)}/></View>:null}/>
 const c=detail?.conversation
 if(!c)return <View style={styles.center}>{feedback}{loading&&<ActivityIndicator color={mobileDesign.emerald}/>}<Text style={styles.muted}>Loading conversation…</Text></View>
 const toggleSafety=async()=>{
  if(!safetyTarget||busy)return
  const kind=safetyTarget,enabled=kind==='block'?!c.blockedByMe:!c.mutedByMe
  setSafetyTarget(null)
  if(kind==='block'&&enabled){setShareActivity(false);lastTyping.current=0}
  await mutate({action:'safety',id,kind,enabled})
 }
 const messages=Array.from(new Map([...older,...(detail?.items??[])].map(m=>[m.id,m])).values()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
 return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={Platform.OS==='ios'?85:0}>
  <View style={styles.threadHeader}><Text numberOfLines={1} style={styles.heading}>{c.peer?.displayName??'Member'}</Text><Text style={styles.muted}>{c.canSend&&peerActivity.typing?'Typing…':c.canSend&&peerActivity.active?'Active in this chat':'Private conversation'}</Text>{feedback}<View style={styles.row}><Action label={c.mutedByMe?'Unmute':'Mute'} secondary disabled={busy} onPress={()=>setSafetyTarget('mute')}/><Action label={c.blockedByMe?'Unblock':'Block'} secondary disabled={busy} onPress={()=>setSafetyTarget('block')}/></View>{!!reportStatus&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{reportStatus}</Text>}{c.canSend&&<View style={styles.activityRow}><Text style={styles.muted}>Share chat activity</Text><Switch accessibilityLabel="Share chat activity" value={shareActivity} onValueChange={value=>{setShareActivity(value);lastTyping.current=0}}/></View>}</View>
  {c.status==='PENDING'?<View style={styles.content}><Text style={styles.title}>{c.requesterId===userId?'Waiting for acceptance':'Message request'}</Text>{c.requesterId!==userId&&<View style={styles.row}><Action label="Accept" disabled={busy} onPress={()=>void mutate({action:'accept',id})}/><Action label="Decline" secondary disabled={busy} onPress={()=>void mutate({action:'decline',id})}/></View>}</View>:c.status==='DECLINED'?<View style={styles.content}><Text style={styles.muted}>This request was declined.</Text></View>:<>
  <FlatList inverted contentContainerStyle={styles.content} data={messages} keyExtractor={m=>m.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.muted}>Start the conversation.</Text>} ListFooterComponent={cursor?<Action label="Load older messages" secondary disabled={busy} onPress={()=>void more()}/>:null} renderItem={({item})=>{const mine=item.senderId===userId;return <View style={[styles.bubble,mine&&styles.mine]}><Text style={[styles.message,mine&&styles.mineText]}>{item.removedAt?'Message removed by moderation':item.body}</Text>{!item.removedAt&&item.attachment?.mime.startsWith('audio/')&&<ChatVoicePlayer key={userId+':'+item.id} messageId={item.id} userId={userId} mime={item.attachment.mime}/>}{!item.removedAt&&item.attachment&&!item.attachment.mime.startsWith('audio/')&&<Pressable accessibilityRole="button" disabled={busy} style={{padding:8,borderWidth:1,borderColor:mine?'#fff':mobileDesign.border,borderRadius:10,marginTop:6}} onPress={()=>void openFile(item.id)}><Text style={[styles.message,mine&&styles.mineText]}>{item.attachment.filename}</Text><Text style={[styles.timestamp,mine&&styles.mineText]}>{Math.ceil(item.attachment.size/1024)} KB · Open file</Text></Pressable>}{!mine&&!item.removedAt&&<Pressable accessibilityRole="button" disabled={busy||reported.includes(item.id)} style={{minHeight:32,justifyContent:'center'}} onPress={()=>{setReportTarget(item.id);setReportReason('SPAM');setReportDetails('');setError('')}}><Text style={styles.link}>{reported.includes(item.id)?'Reported':'Report message'}</Text></Pressable>}<Text style={[styles.timestamp,mine&&styles.mineText]}>{formatDateTime(item.createdAt)}{mine?(item.readAt?' · Read':' · Sent'):''}</Text></View>}}/>
  {!!receiptStatus&&<Text accessibilityLiveRegion="polite" style={[styles.muted,{padding:10}]}>{receiptStatus}</Text>}
  {pendingText&&<View style={styles.content}><Text style={styles.title}>Pending confirmation</Text><Text style={styles.message}>{pendingText.body}</Text><Text style={styles.muted}>Saved securely on this device. Retry only when you choose; expired copies are cleared when reopened.</Text><View style={styles.row}><Action label="Check delivery" secondary disabled={busy||!pendingReady} onPress={()=>void reconcileText(false)}/><Action label="Retry" disabled={busy||!pendingReady||!c.canSend} onPress={()=>void reconcileText(true)}/></View><Action label="Discard local copy" secondary disabled={busy} onPress={()=>setDiscardPending(true)}/></View>}
  {c.canSend?<View style={{backgroundColor:'#fff'}}>{attachmentEnabled&&!file&&<View style={{paddingHorizontal:12,paddingTop:6}}><ChatVoiceRecorder disabled={busy||!!pendingText} onFile={recorded=>{setFile(recorded);setError('')}} onError={setError}/></View>}{file&&<View style={{padding:10,flexDirection:'row',alignItems:'center',gap:8}}><Text style={[styles.muted,{flex:1}]}>{file.name} · {Math.ceil((file.size??0)/1024)} KB</Text><Action secondary label="Remove" disabled={busy} onPress={()=>{if(pendingFile.current){setError('Retry the pending attachment before removing it.');return}const uri=file.uri;setFile(null);void import('expo-file-system').then(fs=>{if(fs.cacheDirectory&&uri.startsWith(fs.cacheDirectory))return fs.deleteAsync(uri,{idempotent:true})}).catch(()=>{})}}/></View>}<View style={styles.composer}>{attachmentEnabled&&<Action secondary label="+" disabled={busy||!!file||!!pending.current} onPress={()=>void pickFile()}/>}<TextInput accessibilityLabel="Message" style={[styles.input,{flex:1,maxHeight:100}]} multiline editable={!busy&&!pendingText&&pendingReady} value={draft} onChangeText={value=>{setDraft(value);lastTyping.current=value.trim()?Date.now():0}} placeholder="Write a message…" placeholderTextColor={mobileDesign.inkMuted} maxLength={4000}/><Action label="Send" disabled={busy||!!pendingText||(!file&&(!draft.trim()||!pendingReady))} onPress={()=>void send()}/></View></View>:<View style={styles.content}><Text style={styles.muted}>Sending is unavailable for this contact.</Text></View>}
  </>}
  <Modal visible={discardPending} transparent animationType="fade" onRequestClose={()=>setDiscardPending(false)}><View style={styles.reportBackdrop}><View style={styles.reportCard} accessibilityViewIsModal><Text style={styles.heading}>Discard pending message?</Text><Text style={styles.muted}>Only the local retry copy will be removed. A message already received by the server will remain in the chat.</Text><View style={styles.row}><Action label="Cancel" secondary onPress={()=>setDiscardPending(false)}/><Action label="Discard" disabled={busy} onPress={()=>{if(!id||sending.current)return;setBusy(true);void clearPendingText(userId,id).then(()=>{pending.current=null;setPendingText(null);setDraft('');setReceiptStatus('Local retry copy discarded.');setDiscardPending(false)}).catch(()=>setError('Could not clear secure storage. Retry.')).finally(()=>setBusy(false))}}/></View></View></View></Modal>
  <Modal visible={!!safetyTarget} transparent animationType="fade" onRequestClose={()=>setSafetyTarget(null)}>
   <View style={styles.reportBackdrop}><View style={styles.reportCard} accessibilityViewIsModal><Text style={styles.heading}>{safetyTarget==='block'?(c.blockedByMe?'Unblock contact?':'Block contact?'):(c.mutedByMe?'Unmute contact?':'Mute contact?')}</Text><Text style={styles.muted}>{safetyTarget==='block'?(c.blockedByMe?'Remove your block. The other person may still have blocked you.':'Stop new private messages and chat activity. Existing history remains available.'):(c.mutedByMe?'Resume eligible message alerts.':'Stop new message alerts without blocking messages.')}</Text><View style={styles.row}><Action label="Cancel" secondary onPress={()=>setSafetyTarget(null)}/><Action label="Confirm" disabled={busy} onPress={()=>void toggleSafety()}/></View></View></View>
  </Modal>
  <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={()=>{if(!busy)setReportTarget(null)}}>
   <View style={styles.reportBackdrop}><View style={styles.reportCard} accessibilityViewIsModal>
    <Text style={styles.heading}>Report message</Text><Text style={styles.muted}>Only the selected message will be available to authorized moderators.</Text>
    {['SPAM','OFFENSIVE','FRAUD','OTHER'].map(reason=><Pressable key={reason} accessibilityRole="radio" accessibilityState={{checked:reportReason===reason}} onPress={()=>setReportReason(reason)} style={[styles.secondary,{padding:12,borderRadius:10,borderWidth:1},reportReason===reason&&{borderColor:mobileDesign.emerald}]}><Text style={styles.title}>{reason==='OFFENSIVE'?'Harassment or offensive content':reason==='FRAUD'?'Fraud or scam':reason==='SPAM'?'Spam':'Other'}</Text></Pressable>)}
    <TextInput accessibilityLabel="Optional report details" style={styles.input} placeholder="Optional details" multiline maxLength={1000} value={reportDetails} onChangeText={setReportDetails}/>
    {!!error&&<Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
    <View style={styles.row}><Action label="Cancel" secondary disabled={busy} onPress={()=>setReportTarget(null)}/><Action label={busy?'Submitting…':'Submit report'} disabled={busy} onPress={()=>void submitReport()}/></View>
   </View></View>
  </Modal>
 </KeyboardAvoidingView>
}
const styles=StyleSheet.create({
 reportBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'center',padding:18},reportCard:{backgroundColor:'#fff',borderRadius:20,padding:18,gap:10},screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:16,gap:10},center:{flex:1,justifyContent:'center',padding:20,gap:12},stack:{gap:10,marginBottom:12},
 heading:{fontSize:21,fontWeight:'700',color:mobileDesign.ink},title:{fontSize:15,fontWeight:'700',color:mobileDesign.ink},muted:{fontSize:13,color:mobileDesign.inkMuted,lineHeight:19},link:{color:mobileDesign.emerald,fontWeight:'700',fontSize:13},
 activityRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},row:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},card:{padding:12,backgroundColor:'#fff',borderRadius:15,borderWidth:1,borderColor:mobileDesign.border,gap:6},contact:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:15,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,marginBottom:8},avatar:{width:42,height:42,borderRadius:21,backgroundColor:'#e4f5ed',alignItems:'center',justifyContent:'center'},badge:{backgroundColor:mobileDesign.emerald,borderRadius:20,paddingHorizontal:8,paddingVertical:4},
 input:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:13,minHeight:46,padding:11,color:mobileDesign.ink,fontSize:15},button:{minHeight:44,paddingHorizontal:15,borderRadius:12,backgroundColor:mobileDesign.emerald,justifyContent:'center',alignItems:'center'},buttonText:{fontWeight:'700',color:'#fff',fontSize:14},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border},secondaryText:{color:mobileDesign.emerald},
 error:{backgroundColor:'#fdf2f2',padding:10,borderRadius:12,gap:8},errorText:{color:'#a73530',fontSize:13},threadHeader:{padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderColor:mobileDesign.border,gap:4},composer:{flexDirection:'row',alignItems:'flex-end',padding:12,gap:8,backgroundColor:'#fff',borderTopWidth:1,borderColor:mobileDesign.border},bubble:{maxWidth:'85%',alignSelf:'flex-start',backgroundColor:'#fff',borderRadius:16,padding:12,marginVertical:4},mine:{alignSelf:'flex-end',backgroundColor:mobileDesign.emerald},message:{fontSize:15,lineHeight:21,color:mobileDesign.ink},mineText:{color:'#fff'},timestamp:{marginTop:5,fontSize:10,color:mobileDesign.inkMuted,textAlign:'right'}
})
