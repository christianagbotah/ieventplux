/** Native mirror of the web's private-by-default Following timeline. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { api, formatDate, type NativeFollowingPage } from '../api/client'
import { useSession } from '../store/session'
import { theme } from '../theme'
import type { FollowingScreenProps } from '../navigation'

type FeedRow = NativeFollowingPage['items'][number]
export default function FollowingScreen({ navigation }: FollowingScreenProps) {
  const { status } = useSession()
  const [items, setItems] = useState<FeedRow[]>([])
  const [followingCount, setFollowingCount] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const load = useCallback(async (next: string | null) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const page = await api.social.feed(next)
      setItems(existing => {
        if (!next) return page.items
        const seen = new Set(existing.map(e => e.kind + ':' + e.id))
        return [...existing, ...page.items.filter(e => !seen.has(e.kind + ':' + e.id))]
      })
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
      setFollowingCount(page.followingCount)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not refresh your Following feed.')
    } finally { setBusy(false); setRefreshing(false); inFlight.current = false }
  }, [])
  useEffect(() => { if (status === 'authenticated') void load(null) }, [status, load])
  if (status !== 'authenticated') return <View style={styles.guest}>
    <Text style={styles.guestIcon}>◎</Text>
    <Text style={styles.guestTitle}>Your events. Your community.</Text>
    <Text style={styles.guestBody}>Sign in to follow organizers and see their public events and announcements in your own feed.</Text>
    <Pressable accessibilityRole="button" style={styles.primary} onPress={() => navigation.navigate('Login')}><Text style={styles.primaryText}>Sign in</Text></Pressable>
    <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate('Discover')}><Text style={styles.secondaryText}>Explore events</Text></Pressable>
  </View>
  return <FlatList style={styles.screen} contentContainerStyle={styles.content} data={items}
    keyExtractor={row => row.kind + ':' + row.id}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.primary} onRefresh={() => {setRefreshing(true);void load(null)}} />}
    ListHeaderComponent={<View>
      <Text style={styles.eyebrow}>EVENTS AND COMMUNITIES WORLDWIDE</Text>
      <Text style={styles.heading}>Following</Text>
      <Text style={styles.description}>New events and announcements from organizers you follow. Private gatherings and unrelated promotions never appear here.</Text>
      <View style={styles.summary}><Text style={styles.summaryBig}>{followingCount}</Text><Text style={styles.summaryLabel}>followed organizers</Text></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {busy && !items.length ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}
    </View>}
    ListEmptyComponent={!busy && !error ? <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{followingCount ? 'No recent public updates yet' : 'Start following organizers'}</Text>
      <Text style={styles.emptyBody}>{followingCount ? 'Updates will appear here when your followed organizers publish new activity.' : 'Discover an event and follow its organizer to personalize your feed.'}</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={() => navigation.navigate('Discover')}><Text style={styles.primaryText}>Discover organizers</Text></Pressable>
    </View> : null}
    ListFooterComponent={hasMore && items.length ? <Pressable accessibilityRole="button" style={styles.more} disabled={busy} onPress={() => void load(cursor)}><Text style={styles.moreText}>{busy ? 'Loading…' : 'Load more activity'}</Text></Pressable> : items.length ? <Text style={styles.end}>You're caught up with your following activity.</Text> : null}
    renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={'View ' + item.event.title} onPress={() => navigation.navigate('EventDetail', { eventId: item.event.id })} style={({pressed}) => [styles.card, pressed && {opacity:.82}]}>
      <View style={styles.organizer}><View style={styles.iconCircle}><Text style={styles.iconText}>{item.kind === 'UPDATE' ? '✦' : '◷'}</Text></View>
        <View style={styles.organizerText}><Text numberOfLines={1} style={styles.orgName}>{item.event.org.name}</Text><Text style={styles.meta}>{item.kind === 'UPDATE' ? 'Announcement' : 'Event added'} · {formatDate(item.activityAt)}</Text></View>
        {item.important ? <Text style={styles.important}>IMPORTANT</Text> : null}
      </View>
      {item.kind === 'UPDATE' ? <View style={styles.post}><Text style={styles.postTitle}>{item.title}</Text><Text style={styles.postBody}>{item.body}</Text></View> : null}
      {item.event.coverImageUrl ? <Image source={{uri:item.event.coverImageUrl}} style={styles.poster} resizeMode="cover" accessibilityLabel={item.event.title + ' event artwork'} /> : null}
      <View style={styles.eventFoot}><Text style={styles.eventTitle} numberOfLines={2}>{item.event.title}</Text><Text style={styles.eventInfo}>{formatDate(item.event.startsAt)} · {item.event.city || 'See details'}</Text><Text style={styles.view}>View event & tickets  →</Text></View>
    </Pressable>}
  />
}
const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},content:{padding:16,paddingBottom:26},
  eyebrow:{fontSize:10,fontWeight:'800',color:theme.colors.primary,letterSpacing:1,marginBottom:7},
  heading:{fontSize:28,fontWeight:'900',color:theme.colors.text,marginBottom:8},
  description:{fontSize:13,lineHeight:21,color:theme.colors.textMuted,marginBottom:14},
  summary:{backgroundColor:theme.web.tealSoft,borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:12,marginBottom:22},
  summaryBig:{fontSize:25,fontWeight:'900',color:theme.colors.primary},
  summaryLabel:{fontSize:12,fontWeight:'700',color:theme.colors.text},
  card:{borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff',borderRadius:19,overflow:'hidden',marginBottom:15},
  organizer:{flexDirection:'row',padding:14,alignItems:'center',gap:10},
  iconCircle:{width:37,height:37,backgroundColor:theme.web.tealSoft,borderRadius:12,alignItems:'center',justifyContent:'center'},
  iconText:{fontSize:20,fontWeight:'800',color:theme.colors.primary},
  organizerText:{flex:1},orgName:{fontSize:14,fontWeight:'800',color:theme.colors.text},
  meta:{fontSize:11,color:theme.colors.textMuted,marginTop:3},
  important:{fontSize:9,color:theme.colors.primary,fontWeight:'800'},
  post:{paddingHorizontal:15,paddingBottom:14},postTitle:{fontSize:17,fontWeight:'800',color:theme.colors.text,marginBottom:6},postBody:{fontSize:13,lineHeight:21,color:theme.colors.text},
  poster:{height:175,width:'100%'},eventFoot:{padding:15},eventTitle:{color:theme.colors.text,fontWeight:'800',fontSize:16},
  eventInfo:{fontSize:12,color:theme.colors.textMuted,marginTop:5},view:{fontSize:12,fontWeight:'800',color:theme.colors.primary,marginTop:10},
  error:{fontSize:12,color:theme.colors.danger,marginBottom:12},loader:{padding:20},
  empty:{padding:24,backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:theme.colors.border,alignItems:'center'},
  emptyTitle:{fontSize:18,fontWeight:'800',color:theme.colors.text,textAlign:'center'},emptyBody:{fontSize:13,lineHeight:21,color:theme.colors.textMuted,marginTop:9,textAlign:'center'},
  primary:{backgroundColor:theme.colors.primary,borderRadius:12,paddingHorizontal:22,minHeight:47,justifyContent:'center',alignItems:'center',marginTop:18},
  primaryText:{color:'#fff',fontWeight:'800',fontSize:14},secondary:{minHeight:46,justifyContent:'center',marginTop:6},secondaryText:{color:theme.colors.primary,fontWeight:'800'},
  more:{minHeight:46,borderWidth:1,borderColor:theme.colors.border,borderRadius:14,justifyContent:'center',alignItems:'center',backgroundColor:'#fff',marginTop:8},moreText:{color:theme.colors.primary,fontWeight:'800'},
  end:{fontSize:11,color:theme.colors.textMuted,textAlign:'center',marginVertical:15},
  guest:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:theme.colors.bg},
  guestIcon:{fontSize:42,color:theme.colors.primary,marginBottom:15},guestTitle:{fontSize:22,color:theme.colors.text,fontWeight:'900',textAlign:'center'},
  guestBody:{textAlign:'center',color:theme.colors.textMuted,fontSize:14,lineHeight:22,marginTop:10},
})
