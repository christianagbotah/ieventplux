/** Genuine native poll and Q&A controls. Socket events only invalidate authorized HTTP data. */
import {useCallback,useEffect,useRef,useState} from 'react'
import {ActivityIndicator,AppState,Pressable,StyleSheet,Text,TextInput,View} from 'react-native'
import {useIsFocused} from '@react-navigation/native'
import {io} from 'socket.io-client'
import {api,absoluteUrl,ApiClientError,type AudiencePoll,type AudienceQuestion} from '../api/client'
import {useSession} from '../store/session'
import {ActionDialog,type ActionPrompt} from './ActionDialog'
import {SectionHeading,LabelPill,mobileDesign} from '../ui/PremiumUI'
import {canVotePoll,pollDraft,votePercent} from '../lib/engagement-policy'

type Props={eventId:string;eventStatus:string;onSignIn:()=>void;onReveal:(y:number)=>void}
type Snapshot={polls:AudiencePoll[];questions:AudienceQuestion[];isOrg:boolean}
export function EventLiveEngagement(props:Props){
 const {user,status}=useSession()
 if(status==='restoring'||status==='error'||!['PUBLISHED','LIVE','ENDED'].includes(props.eventStatus))return null
 return <Panel key={props.eventId+':'+(user?.id??'guest')} {...props} signedIn={status==='authenticated'&&!!user}/>
}
function Panel({eventId,eventStatus,onSignIn,onReveal,signedIn}:Props&{signedIn:boolean}){
 const focused=useIsFocused()
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loadError,setLoadError]=useState(''),[feedback,setFeedback]=useState(''),[failure,setFailure]=useState('')
 const [busy,setBusy]=useState(false),[prompt,setPrompt]=useState<ActionPrompt|null>(null)
 const [question,setQuestion]=useState(''),[pollTitle,setPollTitle]=useState(''),[options,setOptions]=useState(['',''])
 const [answers,setAnswers]=useState<Record<string,string>>({})
 const [tab,setTab]=useState<'poll'|'qa'>('poll')
 const [composing,setComposing]=useState(false)
 const active=useRef(false),locked=useRef(false),revision=useRef(0),layoutY=useRef(0),controller=useRef<AbortController|null>(null)
 const load=useCallback(async()=>{
  if(!active.current)return false
  controller.current?.abort();const request=new AbortController();controller.current=request;const version=++revision.current
  try{
   const [p,q]=await Promise.all([api.engagement.polls(eventId,request.signal),api.engagement.questions(eventId,request.signal)])
   if(!active.current||version!==revision.current)return false
   setSnapshot({polls:p.polls,questions:q.questions,isOrg:p.isOrg&&q.isOrg});setLoadError('');return true
  }catch(err){if(!active.current||version!==revision.current)return false;setSnapshot(null);setLoadError(err instanceof ApiClientError?err.message:'Could not refresh event engagement.');return false}
 },[eventId])
 useEffect(()=>{
  if(!focused)return
  let joined=false,last=0,debounce:ReturnType<typeof setTimeout>|null=null
  const endpoint=absoluteUrl('/')
  const socket=endpoint?io(endpoint,{path:'/socket.io/',withCredentials:true,autoConnect:false,transports:['websocket','polling'],reconnection:true,reconnectionAttempts:6,timeout:10000}):null
  const refresh=()=>{last=Date.now();void load()}
  const wake=()=>{if(!active.current||debounce)return;debounce=setTimeout(()=>{debounce=null;if(active.current)refresh()},300)}
  socket?.on('connect',()=>{joined=false;socket.emit('join',{room:`event:${eventId}`})})
  socket?.on('room:joined',(data:{room?:string})=>{if(data?.room===`event:${eventId}`){joined=true;wake()}})
  for(const name of ['engagement:changed','poll:update','poll:vote','poll:closed-others','qa:new','qa:update','qa:upvote'])socket?.on(name,wake)
  socket?.on('disconnect',()=>{joined=false});socket?.on('room:denied',()=>{joined=false;socket?.disconnect()})
  const deactivate=()=>{active.current=false;revision.current++;controller.current?.abort();setSnapshot(null);setPrompt(null);socket?.disconnect();joined=false;if(debounce){clearTimeout(debounce);debounce=null}}
  const activate=()=>{active.current=true;socket?.connect();refresh()}
  const sub=AppState.addEventListener('change',state=>{if(state==='active')activate();else deactivate()})
  if(AppState.currentState==='active')activate()
  const timer=setInterval(()=>{if(active.current&&(!joined||Date.now()-last>=30000))refresh()},10000)
  return()=>{deactivate();clearInterval(timer);sub.remove();socket?.removeAllListeners()}
 },[focused,eventId,load])
 useEffect(()=>{if(failure&&focused)onReveal(layoutY.current)},[failure,focused,onReveal])
 const act=async(fn:()=>Promise<unknown>,success:string,after?:()=>void)=>{
  if(!active.current||locked.current)return
  locked.current=true;setBusy(true);setFailure('');setFeedback('')
  try{await fn();if(!active.current)return;after?.();setFeedback(success);await load()}
  catch(err){if(active.current){setFailure(err instanceof ApiClientError?err.message:'Could not complete the action.');await load()}}
  finally{locked.current=false;setBusy(false);setPrompt(null)}
 }
 const confirm=(title:string,description:string,label:string,fn:()=>Promise<unknown>,success:string)=>{
  if(locked.current||!active.current)return
  if(!signedIn){onSignIn();return}
  setPrompt({title,description,confirmLabel:label,onConfirm:()=>void act(fn,success)})
 }
 const draft=pollDraft(pollTitle,options),canAsk=['PUBLISHED','LIVE'].includes(eventStatus)
 return <View onLayout={e=>{layoutY.current=e.nativeEvent.layout.y}} style={styles.section}>
  <SectionHeading title="Live engagement" subtitle="Vote in live polls and ask the organizers questions."/>
  <View style={styles.card}>
   <View style={styles.row}><Pressable accessibilityRole="tab" accessibilityState={{selected:tab==='poll'}} onPress={()=>setTab('poll')} style={[styles.tab,tab==='poll'&&styles.selected]}><Text style={styles.tabText}>Polls</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:tab==='qa'}} onPress={()=>setTab('qa')} style={[styles.tab,tab==='qa'&&styles.selected]}><Text style={styles.tabText}>Q&A</Text></Pressable><SmallButton label="Refresh" disabled={busy} onPress={()=>void load()}/></View>
   {failure?<Text accessibilityRole="alert" style={styles.error}>{failure}</Text>:null}{feedback?<Text accessibilityLiveRegion="polite" style={styles.success}>{feedback}</Text>:null}
   {loadError?<><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text><SmallButton label="Try again" disabled={busy} onPress={()=>void load()}/></>:!snapshot?<ActivityIndicator color={mobileDesign.emerald}/>:<>
   {tab==='poll'?<>
    {snapshot.isOrg?<SmallButton label={composing?'Cancel new poll':'Create poll'} disabled={busy} onPress={()=>setComposing(v=>!v)}/>:null}
    {composing&&snapshot.isOrg?<View style={styles.block}><Text style={styles.heading}>New poll</Text><TextInput accessibilityLabel="Poll question" placeholder="Ask a question" value={pollTitle} maxLength={140} onChangeText={setPollTitle} editable={!busy} style={styles.input}/>{options.map((o,i)=><TextInput key={i} accessibilityLabel={'Option '+(i+1)} placeholder={'Option '+(i+1)} value={o} maxLength={40} editable={!busy} onChangeText={v=>setOptions(old=>old.map((x,j)=>i===j?v:x))} style={styles.input}/>)}{options.length<6?<SmallButton label="Add option" disabled={busy} onPress={()=>setOptions(v=>[...v,''])}/>:null}<SmallButton label="Save draft poll" disabled={busy||!draft} onPress={()=>{if(draft)void act(()=>api.engagement.createPoll(eventId,draft.question,draft.options),'Poll draft saved.',()=>{setPollTitle('');setOptions(['','']);setComposing(false)})}}/></View>:null}
    {!snapshot.polls.length?<Text style={styles.muted}>No polls are available yet.</Text>:null}
    {snapshot.polls.map(p=><View key={p.id} style={styles.block}><View style={styles.row}><LabelPill label={p.status} tone={p.status==='OPEN'?'mint':'light'}/><Text style={styles.muted}>{p.totalVotes} votes</Text></View><Text style={styles.heading}>{p.question}</Text>
     {p.options.map(o=><View key={o.id} style={styles.option}><Text style={styles.optionText}>{o.text}{p.myOptionId===o.id?' · Your vote':''}</Text><Text style={styles.muted}>{o.votes} votes · {votePercent(o.votes,p.totalVotes)}%</Text><View style={styles.track}><View style={[styles.fill,{width:votePercent(o.votes,p.totalVotes)+'%' as `${number}%`}]}/></View>{canVotePoll(eventStatus,p.status,p.myOptionId)?<SmallButton label="Vote" disabled={busy} onPress={()=>confirm('Vote for '+o.text+'?','One vote per account. Your selection cannot be changed.','Cast vote',()=>api.engagement.vote(p.id,o.id),'Your vote has been recorded.')}/>:null}</View>)}
     {snapshot.isOrg&&((p.status==='DRAFT'&&eventStatus==='LIVE')||p.status==='OPEN')?<SmallButton label={p.status==='OPEN'?'Close poll':'Open poll'} disabled={busy} onPress={()=>confirm(p.status==='OPEN'?'Close this poll?':'Open this poll?',p.status==='OPEN'?'No further votes will be accepted.':'Any previously open poll will be closed.','Confirm',()=>api.engagement.pollStatus(p.id,p.status==='OPEN'?'close':'open'),'Poll status updated.')}/>:null}
    </View>)}
   </>:<>
    {canAsk?<View style={styles.block}><TextInput accessibilityLabel="Your question" multiline maxLength={280} editable={!busy} value={question} onChangeText={setQuestion} placeholder="Ask the organizers…" style={[styles.input,styles.multiline]}/><SmallButton label={signedIn?'Send question':'Sign in to ask'} disabled={busy||(signedIn&&question.trim().length<6)} onPress={()=>{if(!signedIn){onSignIn();return}void act(()=>api.engagement.ask(eventId,question.trim()),'Your question was sent.',()=>setQuestion(''))}}/></View>:null}
    {!snapshot.questions.length?<Text style={styles.muted}>No audience questions yet.</Text>:null}
    {snapshot.questions.map(q=><View key={q.id} style={styles.block}><View style={styles.row}><Text style={styles.author}>{q.author.displayName}</Text>{q.pinned?<LabelPill label="PINNED"/>:null}{q.status==='HIDDEN'?<LabelPill label="HIDDEN" tone="cream"/>:null}</View><Text style={styles.optionText}>{q.body}</Text>{q.answer?<Text style={styles.answer}>Organizer answer: {q.answer}</Text>:null}
     <SmallButton label={(q.myUpvote?'Remove upvote':'Upvote')+' · '+q.upvotes} disabled={busy||!canAsk||q.isMine||q.status==='HIDDEN'} onPress={()=>{if(!signedIn){onSignIn();return}void act(()=>api.engagement.questionAction(q.id,'upvote'),'Upvote updated.')}}/>
     {snapshot.isOrg?<><View style={styles.row}><SmallButton label={q.status==='HIDDEN'?'Restore':'Hide'} disabled={busy} onPress={()=>confirm(q.status==='HIDDEN'?'Restore question?':'Hide question?','This changes its audience visibility.','Confirm',()=>api.engagement.questionAction(q.id,q.status==='HIDDEN'?'unhide':'hide'),'Question visibility updated.')}/><SmallButton label={q.pinned?'Unpin':'Pin'} disabled={busy} onPress={()=>void act(()=>api.engagement.questionAction(q.id,q.pinned?'unpin':'pin'),'Question updated.')}/></View>{q.status!=='HIDDEN'?<><TextInput accessibilityLabel={'Answer '+q.author.displayName} value={answers[q.id]??''} maxLength={600} placeholder="Write an answer" onChangeText={v=>setAnswers(old=>({...old,[q.id]:v}))} editable={!busy} style={styles.input}/><SmallButton label="Publish answer" disabled={busy||(answers[q.id]??'').trim().length<2} onPress={()=>void act(()=>api.engagement.questionAction(q.id,'answer',answers[q.id]?.trim()),'Answer published.',()=>setAnswers(old=>({...old,[q.id]:''})))}/></>:null}</>:null}
    </View>)}
   </>}
   </>}
   {busy?<ActivityIndicator color={mobileDesign.emerald}/>:null}
  </View>
  <ActionDialog prompt={prompt} busy={busy} onDismiss={()=>setPrompt(null)}/>
 </View>
}
function SmallButton({label,disabled,onPress}:{label:string;disabled?:boolean;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled}} disabled={disabled} onPress={onPress} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>}
const styles=StyleSheet.create({section:{marginTop:24},card:{backgroundColor:'#fff',borderColor:mobileDesign.border,borderWidth:1,borderRadius:18,padding:14,gap:12},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},tab:{minHeight:44,paddingHorizontal:16,justifyContent:'center',borderRadius:12,backgroundColor:'#f0f3f6'},selected:{backgroundColor:mobileDesign.mintSoft},tabText:{fontWeight:'700',color:mobileDesign.ink},block:{gap:9,borderTopWidth:1,borderTopColor:mobileDesign.border,paddingTop:12},heading:{fontSize:16,fontWeight:'700',color:mobileDesign.ink},muted:{fontSize:13,color:mobileDesign.inkMuted},author:{fontWeight:'700',color:mobileDesign.ink,flexShrink:1},option:{borderWidth:1,borderColor:mobileDesign.border,borderRadius:12,padding:10,gap:6},optionText:{fontSize:15,color:mobileDesign.ink},track:{height:8,borderRadius:8,overflow:'hidden',backgroundColor:'#edf1f4'},fill:{height:8,borderRadius:8,backgroundColor:mobileDesign.emerald},button:{minHeight:44,justifyContent:'center',alignItems:'center',borderRadius:11,paddingHorizontal:13,paddingVertical:8,backgroundColor:mobileDesign.mintSoft},buttonText:{fontSize:14,fontWeight:'700',textAlign:'center',color:mobileDesign.emerald},disabled:{opacity:.45},input:{borderWidth:1,borderColor:mobileDesign.border,borderRadius:12,minHeight:48,paddingHorizontal:12,paddingVertical:10,color:mobileDesign.ink,fontSize:16},multiline:{minHeight:80,textAlignVertical:'top'},answer:{backgroundColor:mobileDesign.mintSoft,borderRadius:10,padding:10,color:mobileDesign.ink,fontSize:14},error:{backgroundColor:'#fff0ed',color:'#9c332a',padding:12,borderRadius:10,fontSize:14},success:{color:mobileDesign.emerald,backgroundColor:mobileDesign.mintSoft,padding:12,borderRadius:10,fontSize:14}})
