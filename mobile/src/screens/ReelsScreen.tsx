/** Editorial, native event-preview reels. No fake video playback controls. */
import {useCallback,useEffect,useState} from 'react'
import {ActivityIndicator,FlatList,Image,Pressable,RefreshControl,Share,StyleSheet,Text,View,useWindowDimensions} from 'react-native'
import {absoluteUrl,api,formatDate,type NativeEventClip} from '../api/client'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type {ReelsScreenProps} from '../navigation'

const eventWebUrl=(slug:string)=>'https://ieventplux.lightworldtech.com/#/event/'+encodeURIComponent(slug)
export default function ReelsScreen({navigation}:ReelsScreenProps){
  const {status}=useSession()
  const {height}=useWindowDimensions()
  const [clips,setClips]=useState<NativeEventClip[]>([])
  const [busy,setBusy]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const [reacted,setReacted]=useState<Record<string,boolean>>({})
  const [reactionBusy,setReactionBusy]=useState<string|null>(null)
  const load=useCallback(async()=>{
    try{const result=await api.discovery.reels();setClips(result.clips);setError('')}
    catch{setError('Event previews are unavailable. Pull down to retry.')}
    finally{setBusy(false);setRefreshing(false)}
  },[])
  useEffect(()=>{void load()},[load])
  const like=async(clip:NativeEventClip)=>{
    if(status!=='authenticated')return navigation.navigate('Login')
    if(reactionBusy||reacted[clip.id])return
    setReactionBusy(clip.id)
    try{await api.social.react(clip.id);setReacted(prev=>({...prev,[clip.id]:true}));setError('')}
    catch{setError('Could not save your reaction. Try again.')}
    finally{setReactionBusy(null)}
  }
  const share=async(clip:NativeEventClip)=>{
    try{await Share.share({message:clip.event.title+'\n'+eventWebUrl(clip.event.slug)})}
    catch{/* Native share sheet cancelled or unavailable. */}
  }
  const cardHeight=Math.max(390,Math.min(height-240,700))
  return <FlatList style={styles.screen} contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false} data={clips} keyExtractor={item=>item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}} tintColor={theme.colors.primary}/>}
    ListHeaderComponent={<View>
      <View style={styles.headerTop}><View style={{flex:1}}><Text style={styles.eyebrow}>STORIES BEHIND THE EXPERIENCES</Text><Text style={styles.title}>Event moments.</Text></View>
        <View style={styles.headerMark}><Text style={styles.headerMarkText}>✦</Text></View></View>
      <View style={styles.explainer}><Text style={styles.explainerIcon}>◎</Text><Text style={styles.explainerText}>Real event artwork and organizer previews. Full video playback will appear only where a supported media source exists.</Text></View>
      {error?<View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} style={styles.errorRetry}><Text style={styles.errorRetryText}>Retry  ↗</Text></Pressable></View>:null}
      {busy?<ActivityIndicator color={theme.colors.primary} style={styles.loader}/>:null}
    </View>}
    ListEmptyComponent={!busy&&!error?<View style={styles.empty}>
      <View style={styles.emptyArt}><PremiumBackdrop mode="midnight"/><TileGlyph kind="spark" size={78}/></View>
      <Text style={styles.emptyTitle}>The next big moment starts here.</Text>
      <Text style={styles.emptyDescription}>Event preview cards will appear as organizers publish eligible experiences. No sample videos or made-up posts are shown.</Text>
      <Pressable style={styles.explore} accessibilityRole="button" onPress={()=>navigation.navigate('Discover')}><Text style={styles.exploreText}>Explore real events  →</Text></Pressable>
    </View>:null}
    renderItem={({item})=><View style={[styles.card,{minHeight:cardHeight}]}>
      {absoluteUrl(item.posterUrl)?<Image source={{uri:absoluteUrl(item.posterUrl)!}} resizeMode="cover" style={styles.cover} accessibilityLabel={item.event.title+' event artwork'}/>:
        <PremiumBackdrop mode="midnight"/>}
      <View style={styles.shade}/>
      <View style={styles.top}><View style={styles.chip}><Text style={styles.chipText}>✦  EVENT STORY</Text></View>
        <Text style={styles.topBrand}>iEventPlux</Text></View>
      <View style={styles.middle}>
        <View style={styles.editorialMark}><Text style={styles.editorialMarkText}>EXPERIENCES ARE BETTER TOGETHER</Text></View>
      </View>
      <View style={styles.bottom}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{item.org.name.trim().slice(0,2).toUpperCase()}</Text></View>
          <View style={styles.identityCopy}><Text style={styles.orgName} numberOfLines={1}>{item.org.name}</Text><Text style={styles.meta}>Experience preview · {formatDate(item.event.startsAt)}</Text></View>
        </View>
        {item.caption?<Text style={styles.caption} numberOfLines={3}>{item.caption}</Text>:null}
        <Text style={styles.eventName} numberOfLines={2}>{item.event.title}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={'Love preview of '+item.event.title}
            disabled={reactionBusy===item.id||Boolean(reacted[item.id])} onPress={()=>void like(item)} style={styles.actionButton}>
            <Text style={styles.actionSymbol}>{reacted[item.id]?'♥':'♡'}</Text><Text style={styles.actionText}>{reacted[item.id]?'Loved':'Love'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={'Share event '+item.event.title}
            onPress={()=>void share(item)} style={styles.actionButton}><Text style={styles.actionSymbol}>↗</Text><Text style={styles.actionText}>Share</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={'Open event '+item.event.title}
            onPress={()=>navigation.navigate('EventDetail',{eventId:item.event.id})} style={styles.actionButton}>
            <Text style={styles.actionSymbol}>▣</Text><Text style={styles.actionText}>Event</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('EventDetail',{eventId:item.nextEvent?.id||item.event.id})} style={styles.detailsLink}>
          <View style={styles.detailsLabel}><Text style={styles.detailsEyebrow}>{item.nextEvent?'COMING UP NEXT':'EXPLORE THIS EXPERIENCE'}</Text>
            <Text numberOfLines={1} style={styles.detailsTitle}>{item.nextEvent?.title||'View event & ticket options'}</Text></View>
          <View style={styles.detailsArrow}><Text style={styles.detailsArrowText}>→</Text></View>
        </Pressable>
      </View>
    </View>}
    ListFooterComponent={clips.length?<Text style={styles.footer}>Event previews showcase real organizer artwork. Watchable broadcasts are separately identified in Live.</Text>:null}
  />
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{paddingHorizontal:13,paddingTop:16,paddingBottom:32},
  headerTop:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:5,marginBottom:14},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.05,color:mobileDesign.emerald},title:{color:mobileDesign.ink,fontWeight:'900',fontSize:29,letterSpacing:-.9,marginTop:6},
  headerMark:{height:43,width:43,backgroundColor:mobileDesign.mintSoft,borderRadius:15,justifyContent:'center',alignItems:'center'},headerMarkText:{fontSize:23,color:mobileDesign.emerald},
  explainer:{backgroundColor:mobileDesign.mintSoft,paddingHorizontal:14,paddingVertical:12,marginBottom:18,borderRadius:16,flexDirection:'row',gap:10,alignItems:'flex-start'},
  explainerIcon:{fontSize:18,fontWeight:'900',color:mobileDesign.emerald},explainerText:{fontSize:11,lineHeight:18,flex:1,color:'#375e58'},
  errorBox:{padding:14,borderRadius:15,backgroundColor:'#fff0ef',marginBottom:10,gap:8},error:{fontSize:12,color:theme.colors.danger},
  errorRetry:{alignSelf:'flex-start',minHeight:35,justifyContent:'center'},errorRetryText:{fontWeight:'900',color:mobileDesign.emerald},loader:{marginVertical:18},
  empty:{backgroundColor:'#fff',borderRadius:24,overflow:'hidden',alignItems:'center',borderWidth:1,borderColor:mobileDesign.border,paddingBottom:26},
  emptyArt:{height:170,width:'100%',backgroundColor:mobileDesign.forestDeep,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  emptyTitle:{fontSize:21,fontWeight:'900',color:mobileDesign.ink,textAlign:'center',marginTop:23,paddingHorizontal:22,lineHeight:27},
  emptyDescription:{fontSize:13,color:mobileDesign.inkMuted,lineHeight:21,textAlign:'center',paddingHorizontal:22,marginTop:10},
  explore:{backgroundColor:mobileDesign.emerald,paddingHorizontal:22,minHeight:51,borderRadius:15,marginTop:20,justifyContent:'center'},exploreText:{color:'#fff',fontWeight:'900',fontSize:13},
  card:{backgroundColor:mobileDesign.forestDeep,borderRadius:28,overflow:'hidden',marginBottom:18,justifyContent:'space-between',shadowColor:mobileDesign.forestDeep,shadowOpacity:.22,shadowRadius:16,shadowOffset:{width:0,height:9},elevation:5},
  cover:{position:'absolute',top:0,bottom:0,left:0,right:0,width:'100%',height:'100%'},
  shade:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'rgba(4,14,24,.48)'},
  top:{padding:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  chip:{borderRadius:13,paddingHorizontal:12,paddingVertical:9,backgroundColor:'#102b37b8',borderColor:'#ffffff5b',borderWidth:1},
  chipText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.7},topBrand:{color:'#e1f9f1',fontSize:13,fontWeight:'900',letterSpacing:-.4},
  middle:{flex:1,justifyContent:'center',alignItems:'center',paddingVertical:25},
  editorialMark:{backgroundColor:'#122a367a',borderWidth:1,borderColor:'#ffffff53',borderRadius:19,padding:13},
  editorialMarkText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1.1,textAlign:'center'},
  bottom:{paddingHorizontal:18,paddingTop:18,paddingBottom:18,backgroundColor:'rgba(8,22,34,.78)'},
  identityRow:{flexDirection:'row',alignItems:'center',gap:10},avatar:{height:44,width:44,borderRadius:16,backgroundColor:'#dcf8ea',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#ffffff80'},
  avatarText:{fontSize:14,color:mobileDesign.emerald,fontWeight:'900'},identityCopy:{flex:1},orgName:{fontSize:14,color:'#fff',fontWeight:'900'},meta:{fontSize:11,color:'#d0e7e1',marginTop:4},
  caption:{fontSize:13,lineHeight:19,fontWeight:'700',color:'#fff',marginTop:14},
  eventName:{fontSize:21,fontWeight:'900',lineHeight:27,letterSpacing:-.4,color:'#fff',marginTop:12},
  actions:{flexDirection:'row',alignItems:'center',gap:9,marginTop:17,marginBottom:17},
  actionButton:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#ffffff22',borderRadius:14,minHeight:45,borderWidth:1,borderColor:'#ffffff4d'},
  actionSymbol:{fontSize:19,fontWeight:'800',color:'#fff'},actionText:{fontSize:11,fontWeight:'900',color:'#fff'},
  detailsLink:{flexDirection:'row',alignItems:'center',gap:9,padding:12,backgroundColor:'#dcf7e7',borderRadius:17,minHeight:55},
  detailsLabel:{flex:1},detailsEyebrow:{fontSize:9,fontWeight:'900',color:'#2b6a5e',letterSpacing:1},detailsTitle:{fontSize:13,fontWeight:'900',color:mobileDesign.forestDeep,marginTop:3},
  detailsArrow:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:mobileDesign.emerald},detailsArrowText:{fontSize:21,color:'#fff',fontWeight:'900'},
  footer:{color:mobileDesign.inkMuted,textAlign:'center',fontSize:11,lineHeight:18,marginHorizontal:13,marginTop:8},
})
