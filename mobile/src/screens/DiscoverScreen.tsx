/**
 * Discover — GET /api/v1/discovery/home.
 *
 * Flat list of upcoming events (poster, title, date, price) with pull-to-refresh,
 * loading / error / empty states. Tapping a row opens EventDetail.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import {
  ApiClientError,
  api,
  formatDate,
  minPriceLabel,
  type DiscoveryEventCard,
  type DiscoveryHome,
} from '../api/client'
import { theme } from '../theme'
import { useSession } from '../store/session'
import { HOME_STORIES } from '../lib/home-stories'
import type { DiscoverScreenProps } from '../navigation'

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; home: DiscoveryHome }
  | { status: 'ready'; home: DiscoveryHome }

export default function DiscoverScreen({ navigation }: DiscoverScreenProps) {
  const { status } = useSession()
  const focused = useIsFocused()
  const listRef = useRef<FlatList<DiscoveryEventCard>>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPlaying, setHeroPlaying] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    return () => sub.remove()
  }, [])
  useEffect(() => {
    if (!focused || !heroPlaying || reducedMotion) return
    const id = setInterval(() => setHeroIndex(index => (index + 1) % HOME_STORIES.length), 6500)
    return () => clearInterval(id)
  }, [focused, heroPlaying, reducedMotion])
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [serverResults, setServerResults] = useState<DiscoveryEventCard[] | null>(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState(false)

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' || prev.status === 'empty' ? prev : { status: 'loading' }))
    try {
      const home = await api.discovery.home()
      setState(home.upcoming.length === 0 ? { status: 'empty', home } : { status: 'ready', home })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load the discovery feed.',
      })
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const home = await api.discovery.home()
      setState(home.upcoming.length === 0 ? { status: 'empty', home } : { status: 'ready', home })
    } catch {
      // Keep showing the current list; pull-to-refresh failures stay silent
      // rather than wiping a usable screen with an error state.
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Search the complete server catalogue with debounce, not just the small
  // homepage rail. Keep a clearly labelled local fallback if connectivity fails.
  useEffect(() => {
    const query = search.trim()
    if (!query && category === 'all') return
    let cancelled = false
    const handle = setTimeout(() => {
      void api.discovery.searchEvents(query, category).then((result) => {
        if (cancelled) return
        setServerResults(result.items)
        setSearchError(false)
      }).catch(() => {
        if (cancelled) return
        setServerResults(null)
        setSearchError(true)
      }).finally(() => {
        if (!cancelled) setSearchBusy(false)
      })
    }, 300)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search, category])

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Watch live events" onPress={() => navigation.navigate('LiveHub')}>
            <Text style={styles.headerActionText}>● Live</Text>
          </Pressable>
          <Pressable
            style={styles.headerAction}
            onPress={() => navigation.navigate(status === 'authenticated' ? 'Checkin' : 'Login')}
            accessibilityRole="button"
            accessibilityLabel={status === 'authenticated' ? 'Open check-in scanner' : 'Sign in'}
          >
            <Text style={styles.headerActionText}>{status === 'authenticated' ? 'Scan' : 'Sign in'}</Text>
          </Pressable>
        </View>
      ),
    })
  }, [navigation, status])

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>We couldn't reach iEventPlux</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Pressable style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    )
  }

  const liveNow = state.home.liveNow.filter((e) => e.broadcasts.some((b) => b.status === 'LIVE'))
  const query = search.trim().toLocaleLowerCase()
  const filtered = query.length > 0 || category !== 'all'
  const fallbackUpcoming = state.home.upcoming.filter((event) => {
    const matchesCategory = category === 'all' || event.categorySlug === category
    const searchable = [event.title, event.org.name, event.city ?? '', event.categorySlug ?? ''].join(' ').toLocaleLowerCase()
    return matchesCategory && (!query || searchable.includes(query))
  })
  const visibleUpcoming = filtered ? (serverResults ?? fallbackUpcoming) : state.home.upcoming
  const featured = state.home.featured[0]
  const story = HOME_STORIES[heroIndex] ?? HOME_STORIES[0]

  return (
    <FlatList<DiscoveryEventCard>
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visibleUpcoming}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={styles.introRow}>
            <View><Text style={styles.introLabel}>DISCOVER iEVENTPLUX</Text><Text style={styles.introTitle}>Experience more.</Text></View>
            <Pressable style={styles.liveShortcut} accessibilityRole="button" accessibilityLabel="Open live events" onPress={() => navigation.navigate('LiveHub')}>
              <Text style={styles.liveShortcutText}>● {state.home.stats.liveNow} LIVE  ›</Text>
            </Pressable>
          </View>
          <View style={styles.hero} accessibilityLabel="Discover events worldwide">
            <View style={styles.heroEyebrowRow}><View style={styles.heroDot} /><Text style={styles.heroKicker}>{story.kicker}</Text></View>
            <Text style={styles.heroTitle}>{story.line}</Text>
            <Text style={styles.heroAccent}>{story.accent}</Text>
            <Text style={styles.heroBody}>{story.description}</Text>
            <View style={styles.heroActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Explore events" style={styles.shopHeroButton}
                onPress={() => listRef.current?.scrollToOffset({offset: 400, animated: true})}>
                <Text style={styles.shopHeroText}>Explore events  →</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Watch live events" style={styles.organizerButton}
                onPress={() => navigation.navigate('LiveHub')}><Text style={styles.organizerButtonText}>◉  Watch live</Text></Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Host an event" style={styles.hostAction}
              onPress={() => void Linking.openURL(status === 'authenticated' ? 'https://ieventplux.lightworldtech.com/#/create-org' : 'https://ieventplux.lightworldtech.com/#/register')}>
              <Text style={styles.hostText}>Host an event  ↗</Text>
            </Pressable>
            <View style={styles.heroControls}>
              {HOME_STORIES.map((story, index) => <Pressable key={story.label} accessibilityRole="button"
                accessibilityLabel={'Show highlight ' + (index + 1) + ': ' + story.label}
                accessibilityState={{selected:index===heroIndex}} onPress={() => setHeroIndex(index)} style={styles.heroControlTouch}>
                <View style={[styles.heroControlDot,index===heroIndex && styles.heroControlActive]} />
              </Pressable>)}
              <Pressable accessibilityRole="button" accessibilityLabel={heroPlaying ? 'Pause rotating highlights' : 'Resume rotating highlights'}
                onPress={() => setHeroPlaying(value => !value)} style={styles.heroPause}>
                <Text style={styles.heroPauseText}>{heroPlaying ? 'Ⅱ  Pause' : '▶  Play'}</Text>
              </Pressable>
            </View>
            {heroIndex === 0 && featured ? <Pressable accessibilityRole="button" accessibilityLabel={'Open featured event: '+featured.title}
              style={styles.heroFeatured} onPress={() => navigation.navigate('EventDetail',{eventId:featured.id})}>
              {featured.coverImageUrl ? <Image source={{uri:featured.coverImageUrl}} style={styles.heroFeaturedImage} /> : <View style={styles.heroFeaturedImage} />}
              <View style={styles.heroFeaturedText}><Text style={styles.heroFeaturedLabel}>IN THE SPOTLIGHT</Text><Text numberOfLines={1} style={styles.heroFeaturedTitle}>{featured.title}</Text></View>
              <Text style={styles.heroFeaturedArrow}>›</Text>
            </Pressable> : heroIndex === 1 ? <Pressable accessibilityRole="button" style={styles.heroFeatured}
              onPress={() => navigation.navigate('LiveHub')}><Text style={styles.heroFeatureSymbol}>◎</Text><View style={styles.heroFeaturedText}><Text style={styles.heroFeaturedLabel}>EXPLORE ONLINE</Text><Text style={styles.heroFeaturedTitle}>Experiences from anywhere</Text></View><Text style={styles.heroFeaturedArrow}>›</Text></Pressable>
              : <Pressable accessibilityRole="button" style={styles.heroFeatured}
                  onPress={() => void Linking.openURL(status === 'authenticated' ? 'https://ieventplux.lightworldtech.com/#/create-org' : 'https://ieventplux.lightworldtech.com/#/register')}><Text style={styles.heroFeatureSymbol}>✦</Text><View style={styles.heroFeaturedText}><Text style={styles.heroFeaturedLabel}>FOR EVENT CREATORS</Text><Text style={styles.heroFeaturedTitle}>Create your own gathering</Text></View><Text style={styles.heroFeaturedArrow}>›</Text></Pressable>}
          </View>

          <View style={styles.searchField}>
            <Text style={styles.searchIcon} accessibilityElementsHidden>⌕</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(text) => {
                setSearch(text)
                setServerResults(null)
                setSearchError(false)
                setSearchBusy(Boolean(text.trim() || category !== 'all'))
              }}
              placeholder="Search upcoming events or cities"
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search upcoming events"
            />
            {search ? (
              <Pressable onPress={() => { setSearch(''); setServerResults(null); setSearchError(false); setSearchBusy(category !== 'all') }} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clearSearch}>
                <Text style={styles.clearSearchText}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
            {[{ slug: 'all', name: 'All events' }, ...state.home.categories].map((option) => (
              <Pressable
                key={option.slug}
                onPress={() => {
                  setCategory(option.slug)
                  setServerResults(null)
                  setSearchError(false)
                  setSearchBusy(Boolean(search.trim() || option.slug !== 'all'))
                }}
                style={[styles.categoryPill, category === option.slug && styles.categoryPillSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: category === option.slug }}
                accessibilityLabel={option.name}
              >
                <Text style={[styles.categoryText, category === option.slug && styles.categoryTextSelected]}>{option.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {featured && !query && category === 'all' ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>In the spotlight</Text></View>
              <FeaturedEventCard event={featured} onPress={() => navigation.navigate('EventDetail', { eventId: featured.id })} />
            </View>
          ) : null}

          {liveNow.length > 0 && !query && category === 'all' ? (
            <View style={styles.liveSection}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Happening live</Text>
                <Text style={styles.livePill}>● LIVE</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={liveNow}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <LiveNowCard
                    event={item}
                    onPress={() => {
                      const live = item.broadcasts.find((b) => b.status === 'LIVE')
                      if (live) navigation.navigate('Broadcast', { broadcastId: live.id })
                    }}
                  />
                )}
              />
            </View>
          ) : null}

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{filtered ? 'Matching events' : 'Explore what’s next'}</Text>
            <Text style={styles.sectionCount}>{visibleUpcoming.length} events</Text>
          </View>
          {filtered && searchBusy ? (
            <View style={styles.searchStatus}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text style={styles.searchStatusText}>Searching all published events…</Text>
            </View>
          ) : null}
          {filtered && searchError ? (
            <Text style={styles.searchStatusText} accessibilityRole="alert">Online search is unavailable. Showing only the events already downloaded.</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.filterEmpty}>
          <Text style={styles.emptyTitle}>{filtered ? 'No matching events' : 'No upcoming events yet'}</Text>
          <Text style={styles.errorBody}>{filtered ? 'Try another search or category to explore more gatherings.' : 'Organizers will appear here as they publish real experiences. Explore the live and social sections in the meantime.'}</Text>
          {filtered ? <Pressable style={styles.retryButton} accessibilityRole="button" onPress={() => { setSearch(''); setCategory('all'); setServerResults(null); setSearchError(false); setSearchBusy(false) }}>
            <Text style={styles.retryButtonText}>Clear filters</Text>
          </Pressable> : null}
        </View>
      }
      renderItem={({ item }) => (
        <EventRow
          event={item}
          onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />
      }
    />
  )
}

function FeaturedEventCard({ event, onPress }: { event: DiscoveryEventCard; onPress: () => void }) {
  return <Pressable style={({pressed}) => [styles.featuredCard, pressed && styles.cardPressed]}
    onPress={onPress} accessibilityRole="button" accessibilityLabel={'View featured event ' + event.title}>
    {event.coverImageUrl ? <Image source={{uri:event.coverImageUrl}} style={styles.featuredImage} accessibilityLabel={event.title+' event artwork'} />
      : <View style={[styles.featuredImage,styles.posterPlaceholder]} />}
    <View style={styles.featuredTint} />
    <View style={styles.featuredChip}><Text style={styles.featuredLabel}>FEATURED EVENT</Text></View>
    <View style={styles.featuredBody}>
      <Text style={styles.featuredMeta}>{formatDate(event.startsAt)} · {event.city ?? 'See event details'}</Text>
      <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
      <Text style={styles.featuredOrg} numberOfLines={1}>{event.org.name}</Text>
      <View style={styles.featuredBottom}><Text style={styles.featuredAction}>View details & tickets  →</Text><Text style={styles.featuredPrice}>{minPriceLabel((event.ticketTypes ?? []).map(t=>t.priceMinor))}</Text></View>
    </View>
  </Pressable>
}

function LiveNowCard({ event, onPress }: { event: DiscoveryHome['liveNow'][number]; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.liveCard, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Watch ${event.title} live`}
    >
      <View style={styles.liveBadge}>
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>
      {event.coverImageUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- React Native Image uses accessibility props, not alt
        <Image source={{ uri: event.coverImageUrl }} style={styles.livePoster} accessibilityLabel={`${event.title} artwork`} />
      ) : (
        <View style={[styles.livePoster, styles.posterPlaceholder]}>
          <Text style={styles.posterPlaceholderText} numberOfLines={3}>
            {event.title}
          </Text>
        </View>
      )}
      <View style={styles.liveCardBody}>
        <Text style={styles.liveCardTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.liveCardMeta} numberOfLines={1}>
          {event.org.name} · {event.mode === 'HYBRID' ? 'Hybrid' : 'Online'}
        </Text>
        <Text style={styles.liveWatch}>Watch ›</Text>
      </View>
    </Pressable>
  )
}

function EventRow({ event, onPress }: { event: DiscoveryEventCard; onPress: () => void }) {
  const priceLabel = minPriceLabel((event.ticketTypes ?? []).map(t => t.priceMinor))
  return <Pressable style={({pressed}) => [styles.card,pressed && styles.cardPressed]}
    onPress={onPress} accessibilityRole="button" accessibilityLabel={'Open event ' + event.title}>
    <View style={styles.eventPosterWrap}>
      {event.coverImageUrl ? <Image source={{uri:event.coverImageUrl}} style={styles.poster} accessibilityLabel={event.title+' artwork'} />
        : <View style={[styles.poster,styles.posterPlaceholder]}><Text style={styles.posterPlaceholderText} numberOfLines={2}>{event.title}</Text></View>}
      <View style={styles.eventPosterShade} />
      <View style={styles.eventPosterInfo}><Text style={styles.eventPosterInfoText}>{formatDate(event.startsAt)} · {event.city || (event.mode === 'VIRTUAL' || event.mode === 'ONLINE' ? 'Online' : 'Location TBA')}</Text></View>
    </View>
    <View style={styles.cardBody}>
      <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
      <Text style={styles.meta} numberOfLines={1}>{event.org.name}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.modeBadge}><Text style={styles.modeText}>{event.mode === 'VIRTUAL' || event.mode === 'ONLINE' ? 'Online' : event.mode === 'HYBRID' ? 'Hybrid' : 'In person'}</Text></View>
        <Text style={styles.price}>{priceLabel}</Text>
      </View>
    </View>
  </Pressable>
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.colors.bg },
  listContent: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 30 },
  introRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  introLabel: { color: theme.colors.primary, fontSize: 10, letterSpacing: 1.2, fontWeight: '800', marginBottom: 4 },
  introTitle: { color: theme.colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -.7 },
  liveShortcut: { backgroundColor: '#f9eeee', borderRadius: 100, paddingHorizontal: 13, minHeight: 37, justifyContent: 'center' },
  liveShortcutText: { color: '#a73530', fontSize: 10, fontWeight: '900', letterSpacing: .2 },
  hero: { backgroundColor: '#103f34', borderRadius: 24, paddingHorizontal: 23, paddingVertical: 25, marginBottom: 20, overflow: 'hidden' },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroDot: { width: 7, height: 7, backgroundColor: '#f3c464', borderRadius: 4 },
  heroKicker: { color: '#b2e7d5', fontSize: 10, fontWeight: '800', letterSpacing: 1.0, flexShrink: 1 },
  heroTitle: { color: '#ffffff', fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
  heroAccent: { color: '#b2e7d5', fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 37 },
  heroBody: { color: '#d1e2e0', fontSize: 13, lineHeight: 21, marginTop: 13 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 17, gap: 18 },
  heroStat: { alignItems: 'flex-start' },
  heroStatValue: { color: '#ffffff', fontWeight: '900', fontSize: 20 },
  heroStatLabel: { color: '#b9dccd', fontSize: 10, fontWeight: '600', marginTop: 2 },
  heroStatDivider: { height: 25, borderLeftWidth: 1, borderLeftColor: '#7caf9f' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 },
  shopHeroButton: { flex: 1, minWidth: 120, minHeight: 45, borderRadius: 12, backgroundColor: '#e7faed', justifyContent: 'center', alignItems: 'center' },
  shopHeroText: { fontSize: 12, fontWeight: '800', color: '#075c3d' },
  organizerButton: { flex: 1, minWidth: 120, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#629d87', justifyContent: 'center', alignItems: 'center' },
  organizerButtonText: { color: '#e3f7ed', fontSize: 12, fontWeight: '800' },
  hostAction: { alignSelf:'flex-start', minHeight:42, justifyContent:'center', marginTop:4 },
  hostText: { color:'#e5f8f2',fontSize:12,fontWeight:'800' },
  heroControls: { flexDirection:'row',alignItems:'center',marginTop:7,gap:2 },
  heroControlTouch:{width:32,height:35,justifyContent:'center',alignItems:'center'},
  heroControlDot:{width:9,height:6,borderRadius:4,backgroundColor:'#63988c'},
  heroControlActive:{width:23,backgroundColor:'#b2e7d5'},
  heroPause:{minHeight:36,marginLeft:5,justifyContent:'center',paddingHorizontal:6},
  heroPauseText:{fontWeight:'800',color:'#d2e9e5',fontSize:10},
  heroFeatured:{marginTop:13,borderRadius:13,backgroundColor:'#ffffff18',borderWidth:1,borderColor:'#ffffff35',padding:9,flexDirection:'row',alignItems:'center',gap:10},
  heroFeaturedImage:{height:43,width:43,borderRadius:9,backgroundColor:'#30685a'},
  heroFeaturedText:{flex:1},heroFeaturedLabel:{color:'#abddce',fontSize:10,fontWeight:'800',letterSpacing:1.0},
  heroFeaturedTitle:{color:'#ffffff',fontSize:12,fontWeight:'800',marginTop:3},
  heroFeaturedArrow:{color:'#d5f3e5',fontSize:22,fontWeight:'700'},
  heroFeatureSymbol:{height:43,width:43,overflow:'hidden',backgroundColor:'#ffffff18',borderRadius:10,textAlign:'center',textAlignVertical:'center',color:'#d5f3e5',fontSize:23},
  searchField: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, minHeight: 52, marginBottom: 12, paddingHorizontal: 14 },
  searchIcon: { fontSize: 26, color: theme.colors.primary, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, paddingVertical: 12 },
  clearSearch: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: theme.colors.textMuted, fontSize: 25 },
  categoryScroll: { marginBottom: 22 },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  searchStatusText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 19, marginBottom: 10 },
  categoryRow: { gap: 8, paddingBottom: 3 },
  categoryPill: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10, minHeight: 42, justifyContent: 'center' },
  categoryPillSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  categoryText: { color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 },
  categoryTextSelected: { color: '#ffffff' },
  sectionBlock: { marginBottom: 22 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.25 },
  sectionCount: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  livePill: { color: theme.colors.danger, fontWeight: '800', fontSize: 10 },
  featuredCard: { borderRadius: 20, backgroundColor: '#061b28', overflow: 'hidden', elevation: 2, minHeight:250 },
  featuredImage: { width: '100%',height: 255,resizeMode: 'cover' },
  featuredTint: { position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:'rgba(3,20,29,.56)' },
  featuredChip:{position:'absolute',top:14,left:14,backgroundColor:'#101b25bf',borderRadius:18,paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:'#ffffff55'},
  featuredBody: {position:'absolute',left:0,right:0,bottom:0,padding:16},
  featuredLabel: {fontSize:10,fontWeight:'900',color:'#fff',letterSpacing:1.1},
  featuredTitle: {color:'#fff',fontWeight:'900',fontSize:22,lineHeight:27,marginTop:6},
  featuredMeta:{color:'#e4eee9',fontSize:12,marginTop:3},
  featuredOrg:{color:'#e3e9eb',fontSize:12,marginTop:4},
  featuredBottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#ffffff55',marginTop:12,paddingTop:11},
  featuredPrice:{color:'#b6f4dc',fontWeight:'900',fontSize:13},
  featuredAction:{color:'#fff',fontWeight:'800',fontSize:12},
  filterEmpty: { alignItems: 'center', padding: theme.spacing.xxl, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, backgroundColor: theme.colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { paddingHorizontal: theme.spacing.sm, minHeight: 44, justifyContent: 'center' },
  headerActionText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 13 },
  liveSection: { marginBottom: theme.spacing.lg },
  liveSectionTitle: { color: theme.colors.text, fontSize: 19, fontWeight: '800', marginBottom: theme.spacing.sm },
  liveCard: {
    width: 168,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  liveBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    zIndex: 1,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  liveBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  livePoster: { width: '100%', height: 96, resizeMode: 'cover' },
  liveCardBody: { padding: theme.spacing.md },
  liveCardTitle: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  liveCardMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  liveWatch: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 12, marginTop: theme.spacing.xs },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },
  poster: { width: '100%',height: 184,resizeMode: 'cover' },
  eventPosterWrap: {position:'relative',backgroundColor:'#0d5349'},
  eventPosterShade:{position:'absolute',left:0,right:0,bottom:0,height:46,backgroundColor:'#091b28a8'},
  eventPosterInfo:{position:'absolute',left:12,bottom:11},
  eventPosterInfoText:{color:'#fff',fontWeight:'800',fontSize:12},
  posterPlaceholder: { backgroundColor: theme.colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.sm },
  posterPlaceholderText: { color: '#ffffff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cardBody:{padding:15},
  cardFooter:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:13},
  modeBadge:{backgroundColor:'#edf7f4',paddingHorizontal:11,paddingVertical:7,borderRadius:18,borderWidth:1,borderColor:theme.colors.border},
  modeText:{fontSize:11,color:theme.colors.primary,fontWeight:'800'},
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '800', lineHeight: 22 },
  meta: { color: theme.colors.textMuted, fontSize: 12, marginTop: theme.spacing.xs },
  price: { color: theme.colors.primaryDark, fontWeight: '900', marginTop: theme.spacing.sm, fontSize: 14 },
  errorTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700', marginBottom: theme.spacing.sm },
  errorBody: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryButton: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  retryButtonText: { color: '#ffffff', fontWeight: '700' },
  emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700', marginBottom: theme.spacing.sm },
})
