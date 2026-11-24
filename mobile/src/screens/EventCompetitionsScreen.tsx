/** Genuine server-backed award categories and one-free-vote ballots.
 * No fabricated tallies, offline votes or client-side winners. */
import {useCallback,useEffect,useState} from 'react'
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View,type DimensionValue} from 'react-native'
import {absoluteUrl,api,ApiClientError,type EventCompetitionView,type CompetitionNomineeView,type CompetitionCategoryView} from '../api/client'
import {ActionDialog,type ActionPrompt} from '../components/ActionDialog'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,LabelPill,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type {EventCompetitionsScreenProps} from '../navigation'

const timeLabel=(value:string)=>{
  const date=Date.parse(value)
  return Number.isFinite(date)?new Date(date).toLocaleString():'Time to be announced'
}

export default function EventCompetitionsScreen({route,navigation}:EventCompetitionsScreenProps){
  const {eventId,eventTitle}=route.params
  const {user}=useSession()
  const [competitions,setCompetitions]=useState<EventCompetitionView[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [feedback,setFeedback]=useState('')
  const [busy,setBusy]=useState(false)
  const [prompt,setPrompt]=useState<ActionPrompt|null>(null)
  const load=useCallback(async()=>{
    try{
      const response=await api.competitions.list(eventId)
      setCompetitions(response.competitions)
      setError('')
    }catch(reason){
      // Never display an old private ballot when access is revoked.
      setCompetitions([])
      setError(reason instanceof ApiClientError?reason.message:'Cannot load award competitions.')
    }finally{setLoading(false)}
  },[eventId])
  useEffect(()=>{void load()},[load,user?.id])
  useEffect(()=>{
    const timer=setInterval(()=>{void load()},30000)
    return()=>clearInterval(timer)
  },[load])
  function confirmVote(contest:EventCompetitionView,category:CompetitionCategoryView,nominee:CompetitionNomineeView){
    if(busy||!contest.canVote||category.myNomineeId)return
    if(!user){navigation.navigate('Login');return}
    setPrompt({
      title:'Vote for '+nominee.name+'?',
      description:'You have one FREE vote in the '+category.title+' category. You cannot change your selection later. No payment will be taken.',
      confirmLabel:'Cast free vote',
      onConfirm:()=>{
        if(busy)return
        setBusy(true)
        void(async()=>{
          try{
            await api.competitions.vote(contest.id,category.id,nominee.id)
            await load()
            setFeedback('Your vote for '+nominee.name+' was recorded securely.')
          }catch(reason){
            await load()
            setError(reason instanceof ApiClientError?reason.message:'Your vote could not be recorded.')
          }finally{setBusy(false);setPrompt(null)}
        })()
      },
    })
  }
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <View style={styles.heroTop}><Text style={styles.eyebrow}>✦  THE PEOPLE'S CHOICE</Text><Text style={styles.heroEdition}>AWARDS & TALENT</Text></View>
        <Text style={styles.title}>Celebrate the stars.{"\n"}<Text style={styles.accent}>Make your voice count.</Text></Text>
        <Text style={styles.heroText} numberOfLines={2}>{eventTitle}</Text>
        <Text style={styles.heroNote}>Discover outstanding nominees, celebrate talent and cast your supporter vote in real time.</Text>
        <View style={styles.heroBottom}><View><Text style={styles.heroMetric}>{competitions.length}</Text><Text style={styles.heroMetricLabel}>award {competitions.length===1?'competition':'competitions'}</Text></View>
          <View style={styles.heroMarker}><Text style={styles.heroMarkerText}>★</Text></View>
        </View>
      </View>
      <View style={styles.security}>
        <View style={styles.securityIcon}><TileGlyph kind="spark" size={43}/></View>
        <View style={styles.securityCopy}><Text style={styles.securityTitle}>Fair voting, real results</Text>
          <Text style={styles.securityBody}>One free vote per account and award category. Public results are displayed only when the organizer allows them.</Text></View>
      </View>
      <View style={styles.headingRow}>
        <View style={styles.sectionText}><Text style={styles.sectionEyebrow}>OFFICIAL EVENT BALLOTS</Text><Text style={styles.sectionTitle}>Explore the awards</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh award results" disabled={loading||busy} onPress={()=>void load()} style={styles.secondary}>
          <Text style={styles.secondaryLabel}>Refresh ↻</Text>
        </Pressable>
      </View>
      {loading&&!competitions.length?<ActivityIndicator color={theme.colors.primary} style={styles.loader}/>:null}
      {!loading&&!competitions.length&&!error?<View style={styles.empty}>
        <View style={styles.emptyArt}><PremiumBackdrop mode="ocean"/><TileGlyph kind="spark" size={78}/></View>
        <Text style={styles.emptyTitle}>The spotlight is getting ready.</Text>
        <Text style={styles.mutedCenter}>Award competitions will appear here when their organizer publishes eligible categories and nominees.</Text>
      </View>:null}
      {competitions.map(contest=><View key={contest.id} style={styles.contest}>
        <View style={styles.contestTop}>
          <View style={styles.contestHeading}><Text style={styles.contestTitle}>{contest.title}</Text>
            {contest.description?<Text style={styles.muted}>{contest.description}</Text>:null}</View>
          <LabelPill label={contest.canVote?'VOTING OPEN':contest.status==='DRAFT'?'DRAFT':'VOTING CLOSED'} tone={contest.canVote?'mint':'cream'}/>
        </View>
        <View style={styles.dates}><View style={styles.dateItem}><Text style={styles.dateLabel}>VOTING OPENS</Text><Text style={styles.dateValue}>{timeLabel(contest.votingStartsAt)}</Text></View>
          <View style={styles.dateDivider}/><View style={styles.dateItem}><Text style={styles.dateLabel}>VOTING CLOSES</Text><Text style={styles.dateValue}>{timeLabel(contest.votingEndsAt)}</Text></View></View>
        <View style={styles.totalVotes}><Text style={styles.totalVotesText}>{contest.countsVisible?`${(contest.totalVotes??0).toLocaleString('en-US')} verified votes`:'Public totals are not available yet'}</Text></View>
        {contest.categories.map(category=><View key={category.id} style={styles.category}>
          <View style={styles.categoryTop}><View style={styles.categoryText}><Text style={styles.categoryEyebrow}>AWARD CATEGORY</Text><Text style={styles.categoryTitle}>{category.title}</Text></View>
            {category.myNomineeId?<LabelPill label="✓ VOTED"/>:null}</View>
          <Text style={styles.categoryMeta}>{category.myNomineeId?'Your choice has been recorded':contest.countsVisible?`${(category.totalVotes??0).toLocaleString('en-US')} total votes`:'Results not yet public'}</Text>
          {category.nominees.map(nominee=>{
            const selected=category.myNomineeId===nominee.id
            const percent=contest.countsVisible&&category.totalVotes?Math.round(((nominee.votes??0)/category.totalVotes)*100):0
            const photo=nominee.photoUrl?absoluteUrl(nominee.photoUrl):null
            return <View key={nominee.id} style={[styles.nominee,selected&&styles.nomineeSelected]}>
              <View style={styles.nomineeRow}>
                {photo?<Image source={{uri:photo}} style={styles.avatar} accessibilityLabel={nominee.name+' nominee photo'}/>:
                  <View style={[styles.avatar,styles.avatarFallback]}><Text style={styles.initial}>{nominee.name.trim().charAt(0).toUpperCase()}</Text></View>}
                <View style={styles.identity}><Text style={styles.nomineeName}>{nominee.name}</Text>
                  {nominee.bio?<Text style={styles.muted} numberOfLines={3}>{nominee.bio}</Text>:null}</View>
                {selected?<Text style={styles.selectedIcon}>✓</Text>:null}
              </View>
              {contest.countsVisible?<View style={styles.score}>
                <View style={styles.scoreRow}><Text style={styles.scoreText}>{(nominee.votes??0).toLocaleString('en-US')} votes</Text><Text style={styles.percent}>{percent}%</Text></View>
                <View style={styles.track}><View style={[styles.fill,{width:(String(Math.min(100,Math.max(0,percent)))+'%') as DimensionValue}]}/></View>
              </View>:null}
              <Pressable accessibilityRole="button" accessibilityLabel={'Vote free for '+nominee.name+' in '+category.title}
                style={[styles.vote,(busy||!contest.canVote||!!category.myNomineeId)&&styles.disabled,selected&&styles.voteSelected]}
                disabled={busy||!contest.canVote||Boolean(category.myNomineeId)}
                onPress={()=>confirmVote(contest,category,nominee)}>
                <Text style={styles.voteText}>{selected?'✓ Your vote is recorded':category.myNomineeId?'Voting already completed':!contest.canVote?'Voting unavailable':'Vote free for '+nominee.name+'  →'}</Text>
              </Pressable>
            </View>
          })}
        </View>)}
      </View>)}
      {feedback?<Text style={styles.success} accessibilityRole="alert">{feedback}</Text>:null}
      {error?<Text style={styles.error} accessibilityRole="alert">{error}</Text>:null}
    </ScrollView>
    <ActionDialog prompt={prompt} busy={busy} onDismiss={()=>setPrompt(null)}/>
  </View>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,paddingBottom:42,gap:17},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,padding:24,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.18,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:4},
  heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},eyebrow:{color:'#cff8e8',fontSize:10,fontWeight:'900',letterSpacing:1},
  heroEdition:{color:mobileDesign.gold,fontSize:9,fontWeight:'900',letterSpacing:1},title:{fontSize:29,lineHeight:37,letterSpacing:-.9,color:'#fff',fontWeight:'900',marginTop:21},
  accent:{color:'#cff8df'},heroText:{fontSize:14,color:'#fff',fontWeight:'800',marginTop:13},heroNote:{color:'#daf4e9',fontSize:13,lineHeight:21,marginTop:9},
  heroBottom:{marginTop:21,paddingTop:13,borderTopWidth:1,borderTopColor:'#ffffff42',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  heroMetric:{fontSize:24,fontWeight:'900',color:'#fff'},heroMetricLabel:{fontSize:11,fontWeight:'700',color:'#cde5dd'},
  heroMarker:{height:45,width:45,borderRadius:16,backgroundColor:'#ffffff1d',justifyContent:'center',alignItems:'center'},heroMarkerText:{color:mobileDesign.gold,fontSize:25},
  security:{backgroundColor:mobileDesign.mintSoft,padding:14,borderRadius:19,flexDirection:'row',alignItems:'flex-start',gap:12},securityIcon:{marginTop:2},securityCopy:{flex:1},
  securityTitle:{color:mobileDesign.forest,fontSize:13,fontWeight:'900'},securityBody:{color:'#38645a',fontSize:11,lineHeight:18,marginTop:5},
  headingRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},sectionText:{flex:1},
  sectionEyebrow:{color:mobileDesign.emerald,fontSize:10,fontWeight:'900',letterSpacing:1.1},sectionTitle:{color:mobileDesign.ink,fontSize:22,fontWeight:'900',letterSpacing:-.6,marginTop:4},
  secondary:{minHeight:43,backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:mobileDesign.border,justifyContent:'center',paddingHorizontal:13},
  secondaryLabel:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},loader:{margin:12},
  empty:{backgroundColor:'#fff',borderRadius:23,overflow:'hidden',borderWidth:1,borderColor:mobileDesign.border,paddingBottom:24,alignItems:'center'},
  emptyArt:{height:165,backgroundColor:mobileDesign.forestDeep,alignItems:'center',justifyContent:'center',width:'100%',overflow:'hidden'},
  emptyTitle:{color:mobileDesign.ink,fontSize:20,fontWeight:'900',textAlign:'center',marginTop:22,paddingHorizontal:20},
  mutedCenter:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:20,textAlign:'center',paddingHorizontal:20,marginTop:9},
  contest:{padding:16,borderRadius:24,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,gap:14,shadowColor:mobileDesign.shadow,shadowOpacity:.06,shadowRadius:15,shadowOffset:{width:0,height:8},elevation:2},
  contestTop:{gap:12},contestHeading:{gap:7},contestTitle:{fontSize:19,fontWeight:'900',lineHeight:25,color:mobileDesign.ink},muted:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:19},
  dates:{flexDirection:'row',alignItems:'flex-start',backgroundColor:'#f5f8f9',borderRadius:15,padding:12,gap:12},
  dateItem:{flex:1},dateDivider:{width:1,backgroundColor:mobileDesign.border,alignSelf:'stretch'},dateLabel:{fontSize:9,fontWeight:'900',color:mobileDesign.inkSoft,letterSpacing:.8},
  dateValue:{color:mobileDesign.ink,fontSize:11,fontWeight:'800',lineHeight:16,marginTop:5},
  totalVotes:{backgroundColor:mobileDesign.mintSoft,borderRadius:14,padding:11,alignItems:'center'},totalVotesText:{fontSize:11,fontWeight:'900',color:mobileDesign.emerald},
  category:{borderRadius:19,backgroundColor:'#f4f8f7',padding:13,gap:11},categoryTop:{flexDirection:'row',alignItems:'center',gap:10},categoryText:{flex:1},
  categoryEyebrow:{fontSize:9,color:mobileDesign.emerald,fontWeight:'900',letterSpacing:.8},categoryTitle:{color:mobileDesign.ink,fontSize:16,fontWeight:'900',marginTop:4},
  categoryMeta:{fontSize:11,color:mobileDesign.inkMuted},
  nominee:{backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:mobileDesign.border,padding:13,gap:12},
  nomineeSelected:{borderColor:mobileDesign.emerald,backgroundColor:'#fbfffc'},
  nomineeRow:{flexDirection:'row',alignItems:'center',gap:11},avatar:{width:56,height:56,borderRadius:17,backgroundColor:mobileDesign.mintSoft},
  avatarFallback:{alignItems:'center',justifyContent:'center'},initial:{color:mobileDesign.emerald,fontWeight:'900',fontSize:21},
  identity:{flex:1,gap:4},nomineeName:{fontSize:14,color:mobileDesign.ink,fontWeight:'900'},selectedIcon:{color:mobileDesign.emerald,fontSize:19,fontWeight:'900'},
  score:{gap:7},scoreRow:{flexDirection:'row',justifyContent:'space-between',gap:10},scoreText:{fontSize:11,color:mobileDesign.inkMuted},percent:{fontSize:11,fontWeight:'900',color:mobileDesign.emerald},
  track:{height:8,backgroundColor:'#e8efeb',borderRadius:10,overflow:'hidden'},fill:{height:8,backgroundColor:mobileDesign.emerald,borderRadius:10},
  vote:{backgroundColor:mobileDesign.emerald,minHeight:47,alignItems:'center',justifyContent:'center',paddingHorizontal:10,borderRadius:14},
  voteSelected:{backgroundColor:mobileDesign.forest},voteText:{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'},disabled:{opacity:.55},
  success:{backgroundColor:mobileDesign.mintSoft,borderRadius:14,padding:14,color:mobileDesign.emerald,fontSize:12,lineHeight:19},
  error:{backgroundColor:'#fff0e5',borderRadius:14,padding:14,color:'#9a4a24',fontSize:12,lineHeight:19},
})
