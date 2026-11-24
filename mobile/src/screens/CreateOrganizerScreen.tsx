/** Native organizer registration. Server creates owner membership and pending KYC.
 * We do not upload identification or mark a profile as verified on this screen. */
import {useState} from 'react'
import {ActivityIndicator,Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native'
import {api} from '../api/client'
import {EMPTY_ORGANIZER_FORM,ORGANIZER_CATEGORIES,ORGANIZER_PROFILE_FIELDS,organizerOnboardingPayload,
  validateOrganizerOnboarding,type OrganizerCategory,type OrganizerOnboardingForm} from '../lib/organizer-onboarding'
import type {CreateOrganizerScreenProps} from '../navigation'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,mobileDesign} from '../ui/PremiumUI'

function Field({label,value,onChange,placeholder,multiline=false,maxLength=180,autoCapitalize='sentences'}:{
  label:string;value:string;onChange:(s:string)=>void;placeholder:string;multiline?:boolean;maxLength?:number;
  autoCapitalize?:'none'|'sentences'|'words'|'characters'
}){
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted}
      autoCapitalize={autoCapitalize} maxLength={maxLength} multiline={multiline} textAlignVertical={multiline?'top':'center'}
      style={[styles.input,multiline&&styles.multiline]} accessibilityLabel={label}/>
  </View>
}

export default function CreateOrganizerScreen({navigation}:CreateOrganizerScreenProps){
  const {status,refresh}=useSession()
  const [form,setForm]=useState<OrganizerOnboardingForm>({...EMPTY_ORGANIZER_FORM,profileDetails:{}})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const update=<K extends keyof OrganizerOnboardingForm>(key:K,value:OrganizerOnboardingForm[K])=>setForm(old=>({...old,[key]:value}))
  const submit=async()=>{
    if(saving||status!=='authenticated')return
    const issue=validateOrganizerOnboarding(form)
    if(issue){setError(issue);return}
    setSaving(true);setError('')
    try{
      await api.organizer.createOrganization(organizerOnboardingPayload(form))
      try{await refresh()}catch{/* Studio re-reads memberships directly. */}
      Alert.alert('Organizer profile created','Your organizer profile is pending verification. You can start creating event drafts; paid sales require the required identity checks.',[
        {text:'Open studio',onPress:()=>navigation.replace('OrganizerStudio')},
      ])
    }catch(e){setError(e instanceof Error?e.message:'Could not create this organizer profile. Please retry.')}
    finally{setSaving(false)}
  }
  if(status!=='authenticated')return <View style={styles.screen}><View style={styles.panel}><Text style={styles.title}>Sign in to organize events</Text><Text style={styles.description}>Organizer registration needs an authenticated iEventPlux account.</Text><Pressable accessibilityRole="button" style={styles.submit} onPress={()=>navigation.navigate('Login')}><Text style={styles.submitText}>Sign in</Text></Pressable></View></View>
  const type=form.orgType
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <Text style={styles.kicker}>CREATE WITH iEVENTPLUX</Text>
        <Text style={styles.heroTitle}>Start your organizer profile.</Text>
        <Text style={styles.heroBody}>Create a public identity for your events without leaving the app. Your profile starts unverified and private identity documents are handled separately.</Text>
      </View>
      {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
      <View style={styles.panel}>
        <Text style={styles.section}>1. What kind of organizer are you?</Text>
        <View style={styles.choices}>{ORGANIZER_CATEGORIES.map(item=><Pressable key={item.value} accessibilityRole="button"
          accessibilityState={{selected:type===item.value}} onPress={()=>setForm(prev=>({...prev,orgType:item.value,profileDetails:{}}))}
          style={[styles.choice,type===item.value&&styles.choiceActive]}>
          <Text style={[styles.choiceTitle,type===item.value&&styles.choiceTitleActive]}>{item.label}</Text>
          <Text style={styles.choiceCaption}>{item.description}</Text>
        </Pressable>)}</View>
      </View>
      {type?<>
        <View style={styles.panel}>
          <Text style={styles.section}>2. Public organizer details</Text>
          <Field label="Organizer name *" value={form.name} onChange={x=>update('name',x)} placeholder="The public name of your organization" maxLength={120}/>
          <Field label="Tagline" value={form.tagline} onChange={x=>update('tagline',x)} placeholder="A short public introduction" maxLength={160}/>
          <Field label="Description" value={form.description} onChange={x=>update('description',x)} placeholder="What is your organization about?" multiline maxLength={2000}/>
          <Field label="Country code" value={form.country} onChange={x=>update('country',x.toUpperCase())} placeholder="GH" maxLength={2} autoCapitalize="characters"/>
          <Field label="City" value={form.city} onChange={x=>update('city',x)} placeholder="Accra" maxLength={60} autoCapitalize="words"/>
          {ORGANIZER_PROFILE_FIELDS[type].map(field=><Field key={field.key} label={field.label}
            placeholder={field.placeholder} value={form.profileDetails[field.key]??''}
            onChange={value=>update('profileDetails',{...form.profileDetails,[field.key]:value})} maxLength={240}/>)}
        </View>
        <View style={styles.panel}>
          <Text style={styles.section}>3. Optional public contact</Text>
          <Text style={styles.description}>Add only details you want event attendees to see. Your private sign-in email is not required here.</Text>
          <Field label="Public contact email" value={form.contactEmail} onChange={x=>update('contactEmail',x)} placeholder="events@example.com" autoCapitalize="none" maxLength={160}/>
          <Field label="Public contact phone" value={form.contactPhone} onChange={x=>update('contactPhone',x)} placeholder="Official event contact" maxLength={24} autoCapitalize="none"/>
          <Field label="Website (HTTPS)" value={form.website} onChange={x=>update('website',x)} placeholder="https://example.com" autoCapitalize="none" maxLength={300}/>
        </View>
        <View style={styles.notice}><Text style={styles.noticeHeading}>Verification and payments</Text><Text style={styles.noticeBody}>This form creates a pending organizer profile. Paid tickets and payouts still require the existing server checks and identity-verification workflow; there is no shortcut around those requirements.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Create unverified organizer profile" disabled={saving} style={[styles.submit,saving&&{opacity:.6}]}
          onPress={()=>{
            const issue=validateOrganizerOnboarding(form)
            if(issue){setError(issue);return}
            Alert.alert('Create organizer profile?',`Create ${form.name.trim()} as a pending-verification organizer?`,[
              {text:'Cancel',style:'cancel'}, {text:'Create profile',onPress:()=>void submit()},
            ])
          }}>
          {saving?<ActivityIndicator color="#fff"/>:<Text style={styles.submitText}>Create organizer profile</Text>}
        </Pressable>
      </>:null}
      <Pressable accessibilityRole="button" style={styles.back} onPress={()=>navigation.goBack()}><Text style={styles.backText}>Back</Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},content:{padding:16,gap:14,paddingBottom:36},
  hero:{backgroundColor:mobileDesign.forestDeep,padding:25,borderRadius:27,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.17,shadowRadius:16,shadowOffset:{width:0,height:9},elevation:4},kicker:{color:'#b8ead4',fontSize:10,fontWeight:'900',letterSpacing:1.1},
  heroTitle:{fontSize:30,lineHeight:37,color:'#fff',fontWeight:'900',marginTop:9},heroBody:{color:'#ddf4ec',fontSize:12,lineHeight:20,marginTop:8},
  panel:{backgroundColor:'#fff',borderRadius:23,padding:16,borderWidth:1,borderColor:theme.colors.border,gap:13},
  section:{fontSize:17,fontWeight:'900',color:theme.colors.text},title:{fontSize:19,fontWeight:'900',color:theme.colors.text},description:{fontSize:12,lineHeight:19,color:theme.colors.textMuted},
  choices:{gap:9},choice:{borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.bg,borderRadius:13,padding:13,gap:4},
  choiceActive:{borderColor:theme.colors.primary,backgroundColor:theme.web.tealSoft},choiceTitle:{fontSize:14,color:theme.colors.text,fontWeight:'800'},
  choiceTitleActive:{color:theme.colors.primary},choiceCaption:{fontSize:11,color:theme.colors.textMuted,lineHeight:16},
  field:{gap:7},label:{fontSize:12,fontWeight:'800',color:theme.colors.text},
  input:{borderColor:theme.colors.border,backgroundColor:theme.colors.bg,borderWidth:1,borderRadius:12,minHeight:47,paddingHorizontal:12,paddingVertical:9,color:theme.colors.text,fontSize:13},
  multiline:{minHeight:90},error:{fontSize:12,color:theme.colors.danger,lineHeight:19,backgroundColor:'#fff2f1',padding:12,borderRadius:11},
  notice:{backgroundColor:theme.web.tealSoft,padding:15,borderRadius:14,gap:8},noticeHeading:{fontSize:13,fontWeight:'900',color:theme.colors.primary},
  noticeBody:{fontSize:11,lineHeight:18,color:theme.colors.text},submit:{minHeight:52,backgroundColor:theme.colors.primary,alignItems:'center',justifyContent:'center',borderRadius:14},
  submitText:{fontSize:14,fontWeight:'900',color:'#fff'},back:{minHeight:45,alignItems:'center',justifyContent:'center'},backText:{fontSize:13,color:theme.colors.text,fontWeight:'800'},
})
