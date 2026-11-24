/** Native premium live hub. Only actual server-verified LIVE broadcasts appear. */
import {useCallback,useEffect,useState} from 'react'
import {ActivityIndicator,FlatList,Image,Pressable,RefreshControl,StyleSheet,Text,View} from 'react-native'
import {absoluteUrl,api,type DiscoveryHome} from '../api/client'
import {theme} from '../theme'
import {PremiumBackdrop,SectionHeading,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type {LiveHubScreenProps} from '../navigation'

type LiveEvent=DiscoveryHome['liveNow'][number]
export default function LiveHubScreen({navigation}:LiveHubScreenProps){
  const [events,setEvents]=useState<LiveEvent[]>([])
  const [busy,setBusy]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const refresh=useCallback(async()=>{
    try{
      const home=await api.discovery.home()
      setEvents(home.liveNow.filter(row=>row.broadcasts.some(b=>b.status==='LIVE')))
      setError('')
    }catch{setError('Live broadcasts could not be refreshed. Check your connection.')}
    finally{setBusy(false);setRefreshing(false)}
  },[])
  useEffect(()=>{void refresh()},[refresh])
  const openLive=(event:LiveEvent)=>{
    const broadcast=event.broadcasts.find(b=>b.status==='LIVE')
    if(broadcast)navigation.navigate('Broadcast',{broadcastId:broadcast.id})
  }
  return <FlatList style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
    data={events} keyExtractor={item=>item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void refresh()}} tintColor={theme.colors.primary}/>}
    ListHeaderComponent={<View>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <View style={styles.heroKicker}><View style={styles.signalDot}/><Text style={styles.kicker}>THE LIVE EXPERIENCE</Text><Text style={styles.heroSignal}>ON AIR</Text></View>
        <Text style={styles.heroTitle}>Be part of it.{"\n"}<Text style={styles.heroTitleAccent}>From anywhere.</Text></Text>
        <Text style={styles.heroBody}>Real-time events, performances and gatherings shared by organizers worldwide.</Text>
        <View style={styles.heroBottom}>
          <View><Text style={styles.liveCount}>{events.length.toLocaleString('en-US')}</Text><Text style={styles.liveCountLabel}>live broadcasts</Text></View>
          <Pressable style={styles.heroRefresh} accessibilityRole="button" accessibilityLabel="Refresh live broadcasts" onPress={()=>void refresh()}><Text style={styles.heroRefreshText}>Refresh  ↻</Text></Pressable>
        </View>
      </View>
      <SectionHeading eyebrow="HAPPENING AT THIS MOMENT" title="Live experiences" subtitle="Join verified live broadcasts as they happen"/>
      {busy?<ActivityIndicator style={styles.loader} color={theme.colors.primary}/>:null}
      {error?<View style={styles.errorBox}><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable style={styles.retry} accessibilityRole="button" onPress={()=>void refresh()}><Text style={styles.retryText}>Try again</Text></Pressable></View>:null}
    </View>}
    ListEmptyComponent={!busy&&!error?<View style={styles.empty}>
      <View style={styles.emptyHero}><PremiumBackdrop mode="ocean"/><TileGlyph kind="event" size={76}/></View>
      <Text style={styles.emptyTitle}>A live moment is coming.</Text>
      <Text style={styles.emptyBody}>When organizers start genuine broadcasts, they’ll appear here. Explore upcoming events and join their communities in the meantime.</Text>
      <Pressable style={styles.cta} accessibilityRole="button" onPress={()=>navigation.navigate('Discover')}><Text style={styles.ctaText}>Explore upcoming events  →</Text></Pressable>
    </View>:null}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={'Watch live broadcast: '+item.title} onPress={()=>openLive(item)} style={({pressed})=>[styles.card,pressed&&{opacity:.82}]}>
      <View style={styles.imageWrap}>
        {item.coverImageUrl&&absoluteUrl(item.coverImageUrl)?<Image source={{uri:absoluteUrl(item.coverImageUrl)!}} style={styles.image} resizeMode="cover" accessibilityLabel={item.title+' broadcast cover'}/>:
          <View style={styles.fallback}><PremiumBackdrop mode="ocean"/><Text style={styles.fallbackMark}>iEventPlux</Text><Text style={styles.fallbackTitle}>LIVE EXPERIENCE</Text></View>}
        <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>●  LIVE NOW</Text></View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>{item.org.name}  ·  {item.mode==='HYBRID'?'Hybrid experience':'Online broadcast'}</Text>
        <View style={styles.actionRow}><Text style={styles.action}>Watch the live experience</Text><View style={styles.actionIcon}><Text style={styles.actionIconText}>↗</Text></View></View>
      </View>
    </Pressable>}
  />
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{paddingHorizontal:18,paddingTop:16,paddingBottom:38},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,overflow:'hidden',padding:23,marginBottom:28,shadowColor:mobileDesign.forestDeep,shadowOpacity:.18,shadowRadius:19,shadowOffset:{width:0,height:11},elevation:5},
  heroKicker:{flexDirection:'row',alignItems:'center',gap:8},signalDot:{width:9,height:9,borderRadius:5,backgroundColor:'#fa6464'},
  kicker:{color:'#c4f7e7',fontWeight:'900',fontSize:10,letterSpacing:1,flex:1},heroSignal:{fontSize:9,color:'#ffe0dd',letterSpacing:1,fontWeight:'900'},
  heroTitle:{color:'#fff',fontSize:32,lineHeight:40,fontWeight:'900',letterSpacing:-1,marginTop:24},heroTitleAccent:{color:'#cdf8dc'},
  heroBody:{fontSize:13,color:'#e2f4ed',lineHeight:22,marginTop:13},
  heroBottom:{marginTop:23,paddingTop:16,borderTopWidth:1,borderTopColor:'#ffffff36',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  liveCount:{color:'#fff',fontSize:26,fontWeight:'900'},liveCountLabel:{color:'#c6e7dd',fontSize:11,fontWeight:'700'},
  heroRefresh:{backgroundColor:'#e2f9ed',borderRadius:13,minHeight:43,paddingHorizontal:15,justifyContent:'center'},heroRefreshText:{fontSize:12,fontWeight:'900',color:mobileDesign.emerald},
  loader:{padding:18},errorBox:{backgroundColor:'#fff0ed',padding:13,borderRadius:14,marginBottom:13,gap:8},error:{color:theme.colors.danger,fontSize:12,lineHeight:19},retry:{alignSelf:'flex-start',minHeight:35,justifyContent:'center'},retryText:{color:mobileDesign.emerald,fontWeight:'900'},
  empty:{backgroundColor:'#fff',borderRadius:24,overflow:'hidden',alignItems:'center',borderWidth:1,borderColor:mobileDesign.border,paddingBottom:25},
  emptyHero:{height:168,width:'100%',backgroundColor:mobileDesign.forestDeep,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  emptyTitle:{fontSize:21,fontWeight:'900',color:mobileDesign.ink,textAlign:'center',marginTop:21,paddingHorizontal:17},
  emptyBody:{fontSize:13,lineHeight:21,color:mobileDesign.inkMuted,textAlign:'center',paddingHorizontal:22,marginTop:10},
  cta:{backgroundColor:mobileDesign.emerald,paddingHorizontal:19,minHeight:51,borderRadius:15,justifyContent:'center',marginTop:20},ctaText:{fontSize:13,fontWeight:'900',color:'#fff'},
  card:{backgroundColor:'#fff',borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:mobileDesign.border,marginBottom:18,
    shadowColor:mobileDesign.shadow,shadowOpacity:.07,shadowRadius:16,shadowOffset:{width:0,height:8},elevation:3},
  imageWrap:{height:218,backgroundColor:mobileDesign.forest,overflow:'hidden'},image:{width:'100%',height:'100%'},
  fallback:{flex:1,alignItems:'center',justifyContent:'center',overflow:'hidden'},fallbackMark:{fontSize:23,color:'#fff',fontWeight:'900',letterSpacing:-.5},
  fallbackTitle:{fontSize:10,color:'#c7f4e4',fontWeight:'900',marginTop:10,letterSpacing:2},
  liveBadge:{position:'absolute',top:15,left:15,backgroundColor:'#c83137',borderRadius:12,paddingHorizontal:12,paddingVertical:8},
  liveBadgeText:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:'#fff'},
  cardBody:{padding:17},cardTitle:{fontSize:19,lineHeight:25,color:mobileDesign.ink,fontWeight:'900'},
  cardMeta:{fontSize:12,color:mobileDesign.inkMuted,marginTop:8},
  actionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16,paddingTop:13,borderTopWidth:1,borderTopColor:mobileDesign.border},
  action:{fontSize:13,fontWeight:'900',color:mobileDesign.emerald},actionIcon:{width:39,height:39,borderRadius:14,backgroundColor:mobileDesign.mintSoft,justifyContent:'center',alignItems:'center'},
  actionIconText:{fontSize:20,fontWeight:'900',color:mobileDesign.emerald},
})
