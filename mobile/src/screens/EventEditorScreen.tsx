/** Native create-draft and basic metadata editor. Publishing, ticket tiers,
 * payouts, programmes and high-risk permissions remain in the full web studio.
 * The API independently enforces accepted membership + event edit privilege. */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ActivityIndicator,Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,type KeyboardTypeOptions} from 'react-native'
import {api,type Membership} from '../api/client'
import {
  BLANK_EVENT_DRAFT,EVENT_MODES,EVENT_VISIBILITY,canManageNativeEvent,
  deviceTimeZone,editEventDraftPayload,formatLocalDraftDateTime,
  newEventDraftPayload,validateEventDraft,type EventDraftForm,
} from '../lib/organizer-event-form'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,mobileDesign} from '../ui/PremiumUI'
import type {EventEditorScreenProps} from '../navigation'

function Field({label,value,onChange,placeholder,multiline=false,maxLength=200,helper,keyboardType='default'}:{
  label:string;value:string;onChange:(value:string)=>void;placeholder:string;multiline?:boolean;maxLength?:number;helper?:string;
  keyboardType?:KeyboardTypeOptions
}){
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput style={[styles.input,multiline&&styles.multiline]} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} multiline={multiline}
      textAlignVertical={multiline?'top':'center'} maxLength={maxLength} keyboardType={keyboardType}
      autoCorrect={!label.toLowerCase().includes('code')} accessibilityLabel={label}/>
    {helper?<Text style={styles.helper}>{helper}</Text>:null}
  </View>
}
function Options<T extends string>({label,options,value,onChange}:{label:string;options:readonly {value:T;label:string}[];value:T;onChange:(v:T)=>void}){
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.optionRow}>
    {options.map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityState={{selected:option.value===value}}
      style={[styles.option,option.value===value&&styles.optionSelected]} onPress={()=>onChange(option.value)}>
      <Text style={[styles.optionText,option.value===value&&styles.optionTextSelected]}>{option.label}</Text>
    </Pressable>)}
  </View></View>
}

export default function EventEditorScreen({navigation,route}:EventEditorScreenProps){
  const {orgId,eventId}=route.params
  const editing=Boolean(eventId)
  const {status}=useSession()
  const [form,setForm]=useState<EventDraftForm>({...BLANK_EVENT_DRAFT})
  const [org,setOrg]=useState<Membership|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const scroll=useRef<ScrollView>(null)
  const showError=(message:string)=>{setError(message);scroll.current?.scrollTo({y:0,animated:true})}
  const [resultNotice,setResultNotice]=useState('')
  const timeZone=useMemo(()=>deviceTimeZone(),[])
  const update=<K extends keyof EventDraftForm>(key:K,value:EventDraftForm[K])=>setForm(prev=>({...prev,[key]:value}))
  const load=useCallback(async()=>{
    if(status!=='authenticated'){setError('Sign in to manage your event.');setLoading(false);return}
    setLoading(true)
    try{
      const groups=await api.organizer.memberships()
      const selected=groups.items.find(item=>item.orgId===orgId)
      if(!selected||!canManageNativeEvent(selected.role))throw new Error('This account does not have event editing permission for the selected organization.')
      setOrg(selected)
      if(eventId){
        const {event}=await api.events.get(eventId)
        if(event.org.id!==orgId)throw new Error('This event does not belong to your selected organization.')
        const start=formatLocalDraftDateTime(event.startsAt)
        const end=formatLocalDraftDateTime(event.endsAt)
        setForm({
          title:event.title,summary:event.summary||'',description:event.description||'',
          categorySlug:event.categorySlug||'community',country:event.country||'GH',city:event.city||'',
          mode:event.mode==='VIRTUAL'?'VIRTUAL':event.mode==='HYBRID'?'HYBRID':'PHYSICAL',
          visibility:event.visibility==='INVITE_ONLY'?'INVITE_ONLY':event.visibility==='UNLISTED'?'UNLISTED':'PUBLIC',
          startDate:start.date,startTime:start.time,endDate:end.date,endTime:end.time,
        })
      }
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'Could not open the event editor.')}
    finally{setLoading(false)}
  },[orgId,eventId,status])
  useEffect(()=>{void load()},[load])
  const submit=async()=>{
    if(saving||loading||!org)return
    const issue=validateEventDraft(form,editing)
    if(issue){showError(issue);return}
    setSaving(true);setError('')
    try{
      if(eventId){
        await api.organizer.editDetails(eventId,editEventDraftPayload(form))
        setResultNotice('Event details saved to the server.')
      }else{
        const created=await api.organizer.createDraft(newEventDraftPayload(orgId,form))
        setResultNotice('Draft created: '+created.event.title+(created.occurrencesCreated?' · '+created.occurrencesCreated+' additional drafts':''))
      }
      navigation.navigate('OrganizerStudio')
    }catch(e){showError(e instanceof Error?e.message:'The event could not be saved. Please try again.')}
    finally{setSaving(false)}
  }
  const confirmSave=()=>{
    const issue=validateEventDraft(form,editing)
    if(issue){showError(issue);return}
    Alert.alert(editing?'Save event details?':'Create event draft?',editing?
      'Update basic event information. This does not change its publication or tickets.':
      'Create '+(1+Number(form.repeatWeeks||0))+' unpublished draft(s) in this organization. Publish each occurrence separately.',[
      {text:'Cancel',style:'cancel'},
      {text:editing?'Save details':'Create draft',onPress:()=>void submit()},
    ])
  }
  if(loading)return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary}/><Text style={styles.helper}>Loading authorized event details…</Text></View>
  if(!org)return <View style={styles.center}><Text style={styles.error} accessibilityRole="alert">{error||'Event editing unavailable.'}</Text><Pressable accessibilityRole="button" style={styles.outlined} onPress={()=>navigation.goBack()}><Text style={styles.outlinedText}>Back to organizer studio</Text></Pressable></View>
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <Text style={styles.kicker}>{editing?'MANAGE EVENT':'NEW EVENT'}</Text>
        <Text style={styles.title}>{editing?'Edit event details':'Create a new experience'}</Text>
        <Text style={styles.subtitle}>{editing?'Update event information safely. Existing publication, tickets and agenda stay untouched.':'Start an unpublished event draft. Add tickets, speakers, artwork and publishing settings in the full web studio.'}</Text>
        <Text style={styles.orgName}>Organization: {org.orgName}</Text>
      </View>
      {error?<View style={styles.errorBox}><Text style={styles.error} accessibilityRole="alert">{error}</Text></View>:null}
      {resultNotice?<Text style={styles.notice} accessibilityRole="alert">{resultNotice}</Text>:null}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>About your event</Text>
        <Field label="Event title *" value={form.title} onChange={v=>update('title',v)} placeholder="e.g. Worship & Leadership Conference" maxLength={140}/>
        <Field label="Short description" value={form.summary} onChange={v=>update('summary',v)} placeholder="A short introduction to your event" maxLength={200} multiline/>
        <Field label="Full description" value={form.description} onChange={v=>update('description',v)} placeholder="What should attendees expect?" maxLength={8000} multiline/>
        <Field label="Category slug" value={form.categorySlug} onChange={v=>update('categorySlug',v.toLowerCase().trim())} placeholder="community" maxLength={40} helper="Use the category code from iEventPlux (for example music or community)."/>
        <Options label="Event format" options={EVENT_MODES} value={form.mode} onChange={v=>update('mode',v)}/>
      </View>
      {!editing?<View style={styles.panel}>
        <Text style={styles.sectionTitle}>When & where</Text>
        <Text style={styles.helper}>Enter the dates and times as shown on this device. iEventPlux converts them into the timezone {timeZone} for the server.</Text>
        <View style={styles.twoColumns}>
          <View style={styles.half}><Field label="Start date *" value={form.startDate} onChange={v=>update('startDate',v)} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation"/></View>
          <View style={styles.half}><Field label="Start time *" value={form.startTime} onChange={v=>update('startTime',v)} placeholder="HH:MM" maxLength={5} keyboardType="numbers-and-punctuation"/></View>
        </View>
        <View style={styles.twoColumns}>
          <View style={styles.half}><Field label="End date *" value={form.endDate} onChange={v=>update('endDate',v)} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation"/></View>
          <View style={styles.half}><Field label="End time *" value={form.endTime} onChange={v=>update('endTime',v)} placeholder="HH:MM" maxLength={5} keyboardType="numbers-and-punctuation"/></View>
        </View>
        <Field label="Country code" value={form.country} onChange={v=>update('country',v.toUpperCase())} placeholder="GH" maxLength={2}/>
        <Field label="City" value={form.city} onChange={v=>update('city',v)} placeholder="Accra" maxLength={60}/>
        <Field label="Extra weekly occurrences" value={form.repeatWeeks??'0'} onChange={v=>update('repeatWeeks',v.replace(/\D/g,''))} placeholder="0" maxLength={2} keyboardType="number-pad" helper={'0–26 extra drafts. Each keeps the local event time in '+timeZone+'. Publish each separately.'}/>
        <Options label="Visibility" options={EVENT_VISIBILITY} value={form.visibility} onChange={v=>update('visibility',v)}/>
        <Text style={styles.helper}>All new events start as drafts. Invitations, venue privacy and publication are enforced by the server.</Text>
      </View>:<View style={styles.panel}>
        <Text style={styles.sectionTitle}>Location & scheduling</Text>
        <Field label="City" value={form.city} onChange={v=>update('city',v)} placeholder="Accra" maxLength={60}/>
        <Text style={styles.helper}>Event dates and visibility cannot be changed from this basic native editor. Use the advanced organizer studio for full scheduling and publication controls.</Text>
      </View>}
      <Pressable accessibilityRole="button" disabled={saving} onPress={confirmSave} style={[styles.save,saving&&styles.disabled]}>
        {saving?<ActivityIndicator color="#fff"/>:<Text style={styles.saveText}>{editing?'Save event details':'Create unpublished draft'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.outlined} onPress={()=>navigation.goBack()}><Text style={styles.outlinedText}>Cancel and return</Text></Pressable>
      <Text style={styles.footer}>iEventPlux verifies organizer permissions and subscription limits before any event is created or changed.</Text>
    </ScrollView>
  </KeyboardAvoidingView>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},content:{padding:16,paddingBottom:40,gap:14},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:16,padding:22},
  hero:{backgroundColor:mobileDesign.forestDeep,padding:25,borderRadius:27,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.17,shadowRadius:16,shadowOffset:{width:0,height:9},elevation:4},kicker:{fontSize:10,color:'#c7f5e4',fontWeight:'900',letterSpacing:1.1},
  title:{fontSize:29,lineHeight:36,color:'#fff',fontWeight:'900',marginTop:8},subtitle:{fontSize:12,lineHeight:20,color:'#d7efe6',marginTop:10},
  orgName:{fontSize:12,fontWeight:'800',color:'#b1f0d5',marginTop:12},
  panel:{borderRadius:23,backgroundColor:'#fff',borderColor:theme.colors.border,borderWidth:1,padding:17,gap:13},
  sectionTitle:{fontSize:18,fontWeight:'900',color:theme.colors.text,marginBottom:2},
  field:{gap:7},label:{fontSize:12,fontWeight:'800',color:theme.colors.text},
  input:{minHeight:48,backgroundColor:theme.colors.bg,borderWidth:1,borderColor:theme.colors.border,borderRadius:13,paddingVertical:10,paddingHorizontal:12,color:theme.colors.text,fontSize:14},
  multiline:{minHeight:92},helper:{fontSize:11,color:theme.colors.textMuted,lineHeight:19},
  optionRow:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{paddingHorizontal:12,paddingVertical:10,borderRadius:13,borderWidth:1,borderColor:theme.colors.border,minHeight:41,justifyContent:'center'},
  optionSelected:{backgroundColor:theme.web.tealSoft,borderColor:theme.colors.primary},
  optionText:{fontSize:12,fontWeight:'800',color:theme.colors.textMuted},optionTextSelected:{color:theme.colors.primary},
  twoColumns:{flexDirection:'row',gap:12},half:{flex:1},
  errorBox:{padding:13,backgroundColor:'#fff2f1',borderRadius:13},error:{color:theme.colors.danger,fontSize:12,lineHeight:19},
  notice:{fontSize:12,color:theme.colors.primary,fontWeight:'800'},
  save:{minHeight:52,backgroundColor:theme.colors.primary,borderRadius:15,alignItems:'center',justifyContent:'center'},
  saveText:{fontSize:14,fontWeight:'900',color:'#fff'},disabled:{opacity:.55},
  outlined:{minHeight:49,alignItems:'center',justifyContent:'center',borderRadius:15,borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff'},
  outlinedText:{color:theme.colors.text,fontWeight:'800'},footer:{textAlign:'center',fontSize:11,lineHeight:18,color:theme.colors.textMuted},
})
