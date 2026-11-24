/** Native, private-by-default Following timeline: real server events and updates. */
import {useCallback,useEffect,useRef,useState} from 'react'
import {ActivityIndicator,FlatList,Image,Pressable,RefreshControl,StyleSheet,Text,View} from 'react-native'
import {absoluteUrl,api,formatDate,type NativeFollowingPage} from '../api/client'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,SectionHeading,LabelPill,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type {FollowingScreenProps} from '../navigation'

type FeedRow=NativeFollowingPage['items'][number]
export default function FollowingScreen({navigation}:FollowingScreenProps){
  const {status}=useSession()
  const [items,setItems]=useState<FeedRow[]>([])
  const [followingCount,setFollowingCount]=useState(0)
  const [cursor,setCursor]=useState<string|null>(null)
  const [hasMore,setHasMore]=useState(false)
  const [busy,setBusy]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const inFlight=useRef(false)
  const revision=useRef(0)
  const load=useCallback(async(next:string|null)=>{
    if(inFlight.current)return
    inFlight.current=true
    const request=++revision.current
    setBusy(true)
    try{
      const page=await api.social.feed(next)
      if(request!==revision.current)return
      setItems(existing=>{
        if(!next)return page.items
        const seen=new Set(existing.map(e=>e.kind+':'+e.id))
        return [...existing,...page.items.filter(e=>!seen.has(e.kind+':'+e.id))]
      })
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
      setFollowingCount(page.followingCount)
      setError('')
    }catch(reason){if(request===revision.current)setError(reason instanceof Error?reason.message:'Could not refresh your Following feed.')}
    finally{if(request===revision.current){setBusy(false);setRefreshing(false);inFlight.current=false}}
  },[])
  useEffect(()=>{
    if(status==='authenticated')void load(null)
    else{revision.current++;inFlight.current=false;setItems([]);setFollowingCount(0);setCursor(null);setHasMore(false);setBusy(false);setError('')}
    return()=>{revision.current++;inFlight.current=false}
  },[status,load])

  if(status!=='authenticated')return <View style={styles.guest}>
    <View style={styles.guestHero}>
      <PremiumBackdrop mode="midnight"/>
      <View style={styles.guestArt}><TileGlyph kind="organizer" size={76}/></View>
      <Text style={styles.guestEyebrow}>YOUR COMMUNITY, YOUR PEOPLE</Text>
      <Text style={styles.guestTitle}>Stay close to what matters.</Text>
      <Text style={styles.guestBody}>Sign in to follow event creators and receive their public announcements and experiences in your own feed.</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>navigation.navigate('Login')}><Text style={styles.primaryText}>Join your community  →</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.guestSecondary} onPress={()=>navigation.navigate('Discover')}><Text style={styles.guestSecondaryText}>Explore events instead</Text></Pressable>
    </View>
  </View>

  return <FlatList style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} data={items}
    keyExtractor={row=>row.kind+':'+row.id}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.primary} onRefresh={()=>{if(!inFlight.current){setRefreshing(true);void load(null)}}}/>}
    ListHeaderComponent={<View>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <View style={styles.heroKicker}><Text style={styles.heroKickerText}>✦  YOUR INNER CIRCLE</Text><Text style={styles.heroKickerExtra}>FOLLOWING</Text></View>
        <Text style={styles.heading}>Closer to the moments that matter.</Text>
        <Text style={styles.description}>Fresh events and announcements from the people and organizers you choose to follow.</Text>
        <View style={styles.heroFoot}>
          <View style={styles.statNumberBox}><Text style={styles.statNumber}>{followingCount.toLocaleString('en-US')}</Text><Text style={styles.statLabel}>organizers followed</Text></View>
          <Pressable accessibilityRole="button" style={styles.heroDiscover} onPress={()=>navigation.navigate('Discover')}><Text style={styles.heroDiscoverText}>Find more  ↗</Text></Pressable>
        </View>
      </View>
      <SectionHeading eyebrow="ONLY THE PEOPLE YOU FOLLOW" title="Your activity feed" subtitle="Public updates, genuine event listings and announcements"/>
      {error?<View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load(null)} style={styles.retry}><Text style={styles.retryText}>Retry feed  ↗</Text></Pressable></View>:null}
      {busy&&!items.length?<ActivityIndicator color={theme.colors.primary} style={styles.loader}/>:null}
    </View>}
    ListEmptyComponent={!busy&&!error?<View style={styles.empty}>
      <TileGlyph kind="organizer" size={74}/>
      <Text style={styles.emptyTitle}>{followingCount?'No new updates at the moment':'Your circle starts here'}</Text>
      <Text style={styles.emptyBody}>{followingCount?'New public events and updates will arrive when organizers you follow publish them.':'Follow event organizers and creators to build a personalized place for upcoming experiences.'}</Text>
      <Pressable accessibilityRole="button" style={styles.emptyAction} onPress={()=>navigation.navigate('Discover')}><Text style={styles.emptyActionText}>Discover organizers  →</Text></Pressable>
    </View>:null}
    ListFooterComponent={hasMore&&items.length?<Pressable accessibilityRole="button" style={styles.more} disabled={busy} onPress={()=>void load(cursor)}><Text style={styles.moreText}>{busy?'Loading activity…':'See more from your circle  ↓'}</Text></Pressable>:items.length?<Text style={styles.end}>You're all caught up with your circle.</Text>:null}
    renderItem={({item})=><FeedCard item={item} onPress={()=>navigation.navigate('EventDetail',{eventId:item.event.id})}/>}
  />
}

function FeedCard({item,onPress}:{item:FeedRow;onPress:()=>void}){
  const cover=item.event.coverImageUrl?absoluteUrl(item.event.coverImageUrl):null
  return <Pressable accessibilityRole="button" accessibilityLabel={'Open '+item.event.title} onPress={onPress}
    style={({pressed})=>[styles.card,pressed&&{opacity:.82}]}>
    <View style={styles.cardTop}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{item.event.org.name.trim().slice(0,2).toUpperCase()}</Text></View>
      <View style={styles.cardAuthor}><Text style={styles.authorName} numberOfLines={1}>{item.event.org.name}</Text><Text style={styles.authorMeta}>{item.kind==='UPDATE'?'Shared an announcement':'Published an experience'} · {formatDate(item.activityAt)}</Text></View>
      {item.important?<LabelPill label="IMPORTANT" tone="cream"/>:<Text style={styles.moreIcon}>✦</Text>}
    </View>
    {item.kind==='UPDATE'?<View style={styles.announcement}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.announcementBody}>{item.body}</Text></View>:null}
    {cover?<Image source={{uri:cover}} style={styles.poster} resizeMode="cover" accessibilityLabel={item.event.title+' event artwork'}/>:
      <View style={styles.posterFallback}><PremiumBackdrop mode="ocean"/><Text style={styles.posterFallbackLabel}>DISCOVER AN EXPERIENCE</Text><Text style={styles.posterFallbackTitle} numberOfLines={3}>{item.event.title}</Text></View>}
    <View style={styles.cardBody}>
      <LabelPill label={item.kind==='UPDATE'?'COMMUNITY UPDATE':'UPCOMING EVENT'} tone="mint"/>
      <Text style={styles.eventTitle} numberOfLines={2}>{item.event.title}</Text>
      <Text style={styles.eventInfo}>{formatDate(item.event.startsAt)}  ·  {item.event.city||'See venue details'}</Text>
      <View style={styles.cardFooter}><Text style={styles.viewText}>View experience & tickets</Text><View style={styles.arrowBox}><Text style={styles.arrow}>↗</Text></View></View>
    </View>
  </Pressable>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{paddingHorizontal:18,paddingTop:16,paddingBottom:38},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,padding:24,marginBottom:28,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.16,shadowRadius:17,shadowOffset:{width:0,height:9},elevation:4},
  heroKicker:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},heroKickerText:{fontSize:10,fontWeight:'900',letterSpacing:1.3,color:'#c6f9e7'},
  heroKickerExtra:{fontSize:9,fontWeight:'900',color:'#f2d69c',letterSpacing:1},
  heading:{color:'#fff',fontSize:30,lineHeight:38,fontWeight:'900',letterSpacing:-1,marginTop:23,maxWidth:360},
  description:{color:'#e0f2ec',fontSize:13,lineHeight:21,marginTop:10},
  heroFoot:{borderTopWidth:1,borderTopColor:'#ffffff40',marginTop:23,paddingTop:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14},
  statNumberBox:{flexDirection:'row',alignItems:'center',gap:10},statNumber:{fontSize:27,fontWeight:'900',color:'#fff'},statLabel:{color:'#c6eae1',fontSize:11,fontWeight:'700'},
  heroDiscover:{minHeight:43,borderRadius:13,backgroundColor:'#e5f9ef',paddingHorizontal:13,justifyContent:'center'},heroDiscoverText:{fontSize:12,color:mobileDesign.emerald,fontWeight:'900'},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:24,overflow:'hidden',marginBottom:18,
    shadowColor:mobileDesign.shadow,shadowOpacity:.07,shadowRadius:15,shadowOffset:{width:0,height:8},elevation:3},
  cardTop:{flexDirection:'row',alignItems:'center',gap:10,padding:15},avatar:{height:46,width:46,backgroundColor:mobileDesign.mintSoft,borderRadius:16,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#d6eadf'},
  avatarText:{fontSize:15,fontWeight:'900',color:mobileDesign.emerald},cardAuthor:{flex:1},authorName:{fontSize:14,fontWeight:'900',color:mobileDesign.ink},authorMeta:{fontSize:11,color:mobileDesign.inkMuted,marginTop:4},
  moreIcon:{fontSize:20,color:mobileDesign.emerald},
  announcement:{paddingHorizontal:16,paddingBottom:15,gap:7},announcementTitle:{color:mobileDesign.ink,fontSize:17,fontWeight:'900'},announcementBody:{fontSize:13,lineHeight:21,color:mobileDesign.inkMuted},
  poster:{height:210,width:'100%'},posterFallback:{height:188,backgroundColor:mobileDesign.forest,padding:20,justifyContent:'center',overflow:'hidden'},
  posterFallbackLabel:{color:'#c7f1e3',fontSize:10,fontWeight:'900',letterSpacing:1},posterFallbackTitle:{color:'#fff',fontWeight:'900',fontSize:21,lineHeight:28,marginTop:10},
  cardBody:{padding:16},eventTitle:{color:mobileDesign.ink,fontSize:18,lineHeight:24,fontWeight:'900',letterSpacing:-.45,marginTop:10},eventInfo:{color:mobileDesign.inkMuted,fontSize:12,marginTop:7},
  cardFooter:{marginTop:17,paddingTop:12,borderTopWidth:1,borderTopColor:mobileDesign.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},viewText:{color:mobileDesign.emerald,fontSize:12,fontWeight:'900'},
  arrowBox:{backgroundColor:mobileDesign.mintSoft,height:36,width:36,borderRadius:12,justifyContent:'center',alignItems:'center'},arrow:{fontSize:20,color:mobileDesign.emerald,fontWeight:'900'},
  errorBox:{borderRadius:17,padding:14,backgroundColor:'#fff0ef',marginBottom:15,gap:10},error:{color:theme.colors.danger,fontSize:12,lineHeight:19},retry:{alignSelf:'flex-start',padding:8},retryText:{color:mobileDesign.emerald,fontWeight:'900'},
  loader:{paddingVertical:18},empty:{padding:26,borderRadius:24,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',gap:12},
  emptyTitle:{fontSize:20,fontWeight:'900',color:mobileDesign.ink,textAlign:'center'},emptyBody:{fontSize:13,lineHeight:21,color:mobileDesign.inkMuted,textAlign:'center'},
  emptyAction:{backgroundColor:mobileDesign.emerald,paddingHorizontal:19,borderRadius:15,minHeight:48,justifyContent:'center',marginTop:5},emptyActionText:{color:'#fff',fontWeight:'900',fontSize:13},
  more:{backgroundColor:'#fff',borderRadius:15,minHeight:50,borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',justifyContent:'center'},moreText:{color:mobileDesign.emerald,fontWeight:'800'},
  end:{fontSize:11,color:mobileDesign.inkMuted,textAlign:'center',marginVertical:16},
  guest:{flex:1,backgroundColor:mobileDesign.canvas,padding:18,justifyContent:'center'},guestHero:{backgroundColor:mobileDesign.forestDeep,borderRadius:28,padding:24,overflow:'hidden',alignItems:'center'},
  guestArt:{marginBottom:19},guestEyebrow:{fontSize:10,color:'#c7f4e5',fontWeight:'900',letterSpacing:1.3},
  guestTitle:{color:'#fff',fontSize:27,fontWeight:'900',letterSpacing:-.7,lineHeight:34,textAlign:'center',marginTop:13},
  guestBody:{color:'#e1f4ef',fontSize:13,lineHeight:22,textAlign:'center',marginTop:12},
  primary:{backgroundColor:'#d8f7e6',minHeight:50,borderRadius:15,paddingHorizontal:21,alignItems:'center',justifyContent:'center',marginTop:23},
  primaryText:{color:mobileDesign.emerald,fontSize:13,fontWeight:'900'},guestSecondary:{minHeight:46,justifyContent:'center',marginTop:5},guestSecondaryText:{color:'#e1f4ee',fontWeight:'800',fontSize:12},
})
