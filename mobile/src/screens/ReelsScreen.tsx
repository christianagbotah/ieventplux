/** Native screen for the same real event-preview catalogue as web /reels. */
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, ImageBackground, Pressable, RefreshControl, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { api, formatDate, type NativeEventClip } from '../api/client'
import { useSession } from '../store/session'
import { theme } from '../theme'
import type { ReelsScreenProps } from '../navigation'

const eventWebUrl = (slug: string) => 'https://ieventplux.lightworldtech.com/#/event/' + encodeURIComponent(slug)

export default function ReelsScreen({ navigation }: ReelsScreenProps) {
  const { status } = useSession()
  const { height } = useWindowDimensions()
  const [clips, setClips] = useState<NativeEventClip[]>([])
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reacted, setReacted] = useState<Record<string, boolean>>({})
  const [reactionBusy, setReactionBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { const result = await api.discovery.reels(); setClips(result.clips); setError('') }
    catch { setError('Event previews are unavailable. Pull down to retry.') }
    finally { setBusy(false); setRefreshing(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const like = async (clip: NativeEventClip) => {
    if (status !== 'authenticated') return navigation.navigate('Login')
    if (reactionBusy || reacted[clip.id]) return
    setReactionBusy(clip.id)
    try { await api.social.react(clip.id); setReacted(prev => ({...prev,[clip.id]:true})); setError('') }
    catch { setError('Could not save your reaction. Try again.') }
    finally { setReactionBusy(null) }
  }
  const share = async (clip: NativeEventClip) => {
    try { await Share.share({ message: clip.event.title + '\n' + eventWebUrl(clip.event.slug) }) }
    catch { /* Dismissed or unavailable: keep browsing. */ }
  }
  const cardHeight = Math.max(330, Math.min(height - 212, 660))
  return <FlatList style={styles.screen} contentContainerStyle={styles.content}
    data={clips} keyExtractor={item => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true);void load()}} tintColor={theme.colors.primary} />}
    ListHeaderComponent={<View style={styles.header}>
      <View><Text style={styles.eyebrow}>DISCOVER THE MOMENTS</Text><Text style={styles.title}>Reels</Text></View>
      <View style={styles.preview}><Text style={styles.previewText}>EVENT PREVIEWS</Text></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}
    </View>}
    ListEmptyComponent={!busy ? <View style={styles.empty}><Text style={styles.emptyTitle}>No clips yet</Text><Text style={styles.emptyDescription}>Organizers' published event previews will appear here when available.</Text><Pressable style={styles.explore} accessibilityRole="button" onPress={() => navigation.navigate('Discover')}><Text style={styles.exploreText}>Discover events</Text></Pressable></View> : null}
    renderItem={({item}) => <View style={[styles.card,{height:cardHeight}]}>
      <ImageBackground source={{uri:item.posterUrl}} resizeMode="cover" style={styles.poster} accessibilityLabel={'Artwork for ' + item.event.title}>
        <View style={styles.shade} />
        <View style={styles.top}><Text style={styles.chip}>EVENT PREVIEW</Text><Text style={styles.topCounter}>✦ iEventPlux</Text></View>
        <View style={styles.mid}><Pressable accessibilityRole="button" accessibilityLabel={'Open event ' + item.event.title} style={styles.openEvent} onPress={() => navigation.navigate('EventDetail',{eventId:item.event.id})}><Text style={styles.openEventText}>Open event  →</Text></Pressable></View>
        <View style={styles.details}>
          <View style={styles.orgRow}><View style={styles.avatar}><Text style={styles.avatarText}>{item.org.name.slice(0,2).toUpperCase()}</Text></View><View style={styles.orgText}><Text style={styles.orgName}>{item.org.name}</Text><Text style={styles.meta}>Event preview · {formatDate(item.event.startsAt)}</Text></View></View>
          {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}
          <Text style={styles.eventName} numberOfLines={2}>From “{item.event.title}”</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Love preview of ' + item.event.title} disabled={reactionBusy === item.id || reacted[item.id]} onPress={() => void like(item)} style={styles.action}><Text style={styles.actionText}>{reacted[item.id] ? '♥ Loved' : '♡ Love'}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={'View event ' + item.event.title} onPress={() => navigation.navigate('EventDetail',{eventId:item.event.id})} style={styles.action}><Text style={styles.actionText}>◉ Event</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={'Share event ' + item.event.title} onPress={() => void share(item)} style={styles.action}><Text style={styles.actionText}>↗ Share</Text></Pressable>
          </View>
          <Pressable style={styles.next} accessibilityRole="button" onPress={() => navigation.navigate('EventDetail',{eventId:item.nextEvent?.id || item.event.id})}>
            <Text style={styles.nextText} numberOfLines={1}>{item.nextEvent ? 'NEXT OCCURRENCE  ·  ' + item.nextEvent.title : 'View event & ticket options'}</Text><Text style={styles.nextArrow}>→</Text>
          </Pressable>
        </View>
      </ImageBackground>
    </View>}
    ListFooterComponent={clips.length ? <Text style={styles.footer}>Event previews use organizer artwork. Only verified playable broadcasts are presented as videos in the Live experience.</Text> : null}
  />
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},content:{padding:12,paddingBottom:20},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:13},
  eyebrow:{fontSize:10,color:theme.colors.primary,fontWeight:'800',letterSpacing:1.1},title:{fontSize:26,fontWeight:'900',color:theme.colors.text,marginTop:4},
  preview:{backgroundColor:theme.web.tealSoft,borderRadius:15,paddingVertical:10,paddingHorizontal:11},previewText:{fontSize:9,fontWeight:'900',color:theme.colors.primary},
  error:{width:'100%',color:theme.colors.danger,fontSize:12},loader:{margin:12},
  card:{backgroundColor:'#0b1f29',overflow:'hidden',borderRadius:24,marginBottom:12},poster:{width:'100%',height:'100%',justifyContent:'space-between'},
  shade:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'rgba(2,15,25,.50)'},
  top:{zIndex:1,flexDirection:'row',justifyContent:'space-between',padding:17},chip:{color:'#fff',backgroundColor:'rgba(7,47,43,.75)',borderWidth:1,borderColor:'#ffffff40',paddingHorizontal:10,paddingVertical:7,overflow:'hidden',borderRadius:14,fontSize:10,fontWeight:'800'},topCounter:{fontSize:11,color:'#e7f8ef',fontWeight:'800'},
  mid:{flex:1,alignItems:'flex-end',justifyContent:'center',padding:13},openEvent:{padding:12,backgroundColor:'rgba(255,255,255,.23)',borderRadius:20},openEventText:{fontWeight:'800',color:'#fff',fontSize:12},
  details:{padding:18,backgroundColor:'rgba(3,18,29,.79)'},orgRow:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:10},avatar:{width:36,height:36,backgroundColor:theme.colors.primary,borderRadius:18,justifyContent:'center',alignItems:'center'},avatarText:{color:'#fff',fontWeight:'900',fontSize:11},orgText:{flex:1},orgName:{fontWeight:'800',fontSize:13,color:'#fff'},meta:{fontSize:10,color:'#d5e5e3',marginTop:3},caption:{fontSize:13,fontWeight:'600',color:'#fff',marginBottom:8},eventName:{fontSize:12,color:'#e7e7e7',marginBottom:10},
  actions:{flexDirection:'row',gap:9,marginBottom:12},action:{minHeight:43,borderRadius:14,borderWidth:1,borderColor:'#ffffff55',backgroundColor:'#ffffff19',paddingHorizontal:13,justifyContent:'center'},actionText:{color:'#fff',fontSize:12,fontWeight:'800'},
  next:{minHeight:45,backgroundColor:'#ffffff22',borderRadius:14,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:6},nextText:{flex:1,color:'#e4fff4',fontWeight:'800',fontSize:12},nextArrow:{fontSize:19,color:'#e4fff4',fontWeight:'800'},
  footer:{fontSize:11,lineHeight:17,color:theme.colors.textMuted,textAlign:'center',margin:12},empty:{backgroundColor:'#fff',padding:25,borderRadius:20,alignItems:'center',borderWidth:1,borderColor:theme.colors.border},emptyTitle:{fontSize:19,fontWeight:'800',color:theme.colors.text},emptyDescription:{fontSize:13,lineHeight:20,color:theme.colors.textMuted,marginTop:8,textAlign:'center'},explore:{marginTop:17,minHeight:46,backgroundColor:theme.colors.primary,borderRadius:14,paddingHorizontal:22,justifyContent:'center'},exploreText:{color:'#fff',fontWeight:'800'},
})
