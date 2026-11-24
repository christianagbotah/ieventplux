/**
 * Discover — GET /api/v1/discovery/home.
 *
 * Flat list of upcoming events (poster, title, date, price) with pull-to-refresh,
 * loading / error / empty states. Tapping a row opens EventDetail.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Image,
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
import { PremiumBackdrop, SectionHeading, LabelPill, mobileDesign } from '../ui/PremiumUI'
import { useSession } from '../store/session'
import { HOME_STORIES } from '../lib/home-stories'
import { DiscoverFilterSheet } from '../components/DiscoverFilterSheet'
import { buildDiscoveryQuery, isDiscoveryFiltered, type DiscoveryFilters } from '../lib/discovery-filters'
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
  const [filterOpen, setFilterOpen] = useState(false)
  const [countries, setCountries] = useState<{ code: string; count: number }[]>([])
  const [advanced, setAdvanced] = useState<Pick<DiscoveryFilters,'country'|'city'|'mode'|'price'|'when'>>({
    country: '', city: '', mode: '', price: '', when: '',
  })
  const [searchTotal, setSearchTotal] = useState<number | null>(null)
  const [searchPage, setSearchPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [retryFilters, setRetryFilters] = useState(0)
  const searchRevision = useRef(0)
  const timeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  }, [])
  const activeFilters: DiscoveryFilters = useMemo(() => ({q:search,category:category==='all'?'':category,...advanced}), [search,category,advanced])
  const filterKey = JSON.stringify(activeFilters)
  const isFiltered = isDiscoveryFiltered(activeFilters)
  const activeCount = Object.values(activeFilters).filter(v=>v.trim()).length
  const setQuickFilter = (key: keyof typeof advanced, value: string) => {
    setAdvanced(old => ({...old,[key]:old[key] === value ? '' : value}))
  }
  const resetFilters = () => {
    setSearch('');setCategory('all');setAdvanced({country:'',city:'',mode:'',price:'',when:''})
    setServerResults(null);setSearchError(false);setSearchBusy(false)
    listRef.current?.scrollToOffset({offset:0,animated:true})
  }
  useEffect(() => {
    let mounted=true
    void api.discovery.locations().then(data => { if(mounted) setCountries(data.countries) }).catch(() => {})
    return () => {mounted=false}
  }, [])

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
      setRetryFilters(value=>value+1)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Search the full public server catalogue using the web portal's exact
  // query vocabulary, never a misleading client-side subset of homepage items.
  // Ignore stale responses when the user edits filters during an in-flight call.
  useEffect(() => {
    const revision=++searchRevision.current
    if (!isFiltered) {
      setServerResults(null);setSearchBusy(false);setSearchError(false)
      setSearchTotal(null);setSearchPage(1)
      return
    }
    let cancelled=false
    setSearchBusy(true);setSearchError(false);setLoadMoreError(false);setServerResults(null)
    setSearchTotal(null);setSearchPage(1)
    const handle=setTimeout(() => {
      void api.discovery.filterEvents(buildDiscoveryQuery(activeFilters,1,timeZone)).then(result => {
        if (cancelled || revision!==searchRevision.current) return
        setServerResults(result.items);setSearchTotal(result.total)
        setSearchPage(1);setSearchError(false)
      }).catch(() => {
        if (cancelled || revision!==searchRevision.current) return
        setServerResults([]);setSearchError(true)
      }).finally(() => {
        if (!cancelled && revision===searchRevision.current) setSearchBusy(false)
      })
    },300)
    return () => {cancelled=true;clearTimeout(handle)}
  }, [filterKey,retryFilters,timeZone])

  const loadMore = async () => {
    if (!isFiltered || loadingMore || searchBusy || searchTotal === null ||
        (serverResults?.length ?? 0)>=searchTotal) return
    const revision=searchRevision.current
    setLoadingMore(true);setLoadMoreError(false)
    try {
      const result=await api.discovery.filterEvents(buildDiscoveryQuery(activeFilters,searchPage+1,timeZone))
      if (revision!==searchRevision.current) return
      setServerResults(old => {
        const previous=old ?? []
        const seen=new Set(previous.map(item=>item.id))
        return [...previous,...result.items.filter(item=>!seen.has(item.id))]
      })
      setSearchPage(page=>page+1)
      setSearchTotal(result.total)
    } catch { if(revision===searchRevision.current) setLoadMoreError(true) }
    finally {setLoadingMore(false)}
  }

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
  const filtered = isFiltered
  const visibleUpcoming = filtered ? (serverResults ?? []) : state.home.upcoming
  const featured = state.home.featured[0]
  const story = HOME_STORIES[heroIndex] ?? HOME_STORIES[0]

  return (
    <View style={{flex:1}}>
    <FlatList<DiscoveryEventCard>
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visibleUpcoming}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {!filtered ? <>
          <View style={styles.introRow}>
            <View><Text style={styles.introLabel}>DISCOVER iEVENTPLUX</Text><Text style={styles.introTitle}>Experience more.</Text></View>
            <Pressable style={styles.liveShortcut} accessibilityRole="button" accessibilityLabel="Open live events" onPress={() => navigation.navigate('LiveHub')}>
              <Text style={styles.liveShortcutText}>● {state.home.stats.liveNow} LIVE  ›</Text>
            </Pressable>
          </View>
          <View style={styles.hero} accessibilityLabel="Discover events worldwide">
            <PremiumBackdrop mode="emerald" />
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
              onPress={() => navigation.navigate(status === 'authenticated' ? 'OrganizerStudio' : 'Login')}>
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
                  onPress={() => navigation.navigate(status === 'authenticated' ? 'OrganizerStudio' : 'Login')}><Text style={styles.heroFeatureSymbol}>✦</Text><View style={styles.heroFeaturedText}><Text style={styles.heroFeaturedLabel}>FOR EVENT CREATORS</Text><Text style={styles.heroFeaturedTitle}>Create your own gathering</Text></View><Text style={styles.heroFeaturedArrow}>›</Text></Pressable>}
          </View>

          </> : null}
          <View style={styles.searchField}>
            <Text style={styles.searchIcon} accessibilityElementsHidden>⌕</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search upcoming events or cities"
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search upcoming events"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clearSearch}>
                <Text style={styles.clearSearchText}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open advanced event filters"
              style={styles.filterButton} onPress={()=>setFilterOpen(true)}>
              <Text style={styles.filterButtonText}>☷  Filters{activeCount?' · '+activeCount:''}</Text>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFilters}>
              {([
                {key:'when' as const,value:'TODAY',label:'Today'},
                {key:'when' as const,value:'THIS_WEEKEND',label:'This weekend'},
                {key:'price' as const,value:'FREE',label:'Free'},
                {key:'mode' as const,value:'ONLINE',label:'Join online'},
              ]).map(item => <Pressable key={item.key+item.value} accessibilityRole="button"
                accessibilityState={{selected: advanced[item.key]===item.value}}
                style={[styles.quickChip,advanced[item.key]===item.value && styles.quickSelected]}
                onPress={()=>setQuickFilter(item.key,item.value)}>
                <Text style={[styles.quickText,advanced[item.key]===item.value && styles.quickTextSelected]}>{item.label}</Text>
              </Pressable>)}
            </ScrollView>
          </View>
          {filtered ? <View style={styles.activeFilterBanner}>
            <Text style={styles.activeFilterLabel}>Filtering the full event catalogue · {activeCount} active</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear all event filters" onPress={resetFilters}><Text style={styles.clearFilterLabel}>Clear all</Text></Pressable>
          </View> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
            {[{ slug: 'all', name: 'All events' }, ...state.home.categories].map((option) => (
              <Pressable
                key={option.slug}
                onPress={() => setCategory(option.slug)}
                style={[styles.categoryPill, category === option.slug && styles.categoryPillSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: category === option.slug }}
                accessibilityLabel={option.name}
              >
                <Text style={[styles.categoryText, category === option.slug && styles.categoryTextSelected]}>{option.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {featured && !filtered ? (
            <View style={styles.sectionBlock}>
              <SectionHeading eyebrow="HANDPICKED HIGHLIGHTS" title="In the spotlight" />
              <FeaturedEventCard event={featured} onPress={() => navigation.navigate('EventDetail', { eventId: featured.id })} />
            </View>
          ) : null}

          {liveNow.length > 0 && !filtered ? (
            <View style={styles.liveSection}>
              <SectionHeading eyebrow="HAPPENING RIGHT NOW" title="Live experiences" action="Watch live" onAction={()=>navigation.navigate('LiveHub')} />
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

          <SectionHeading eyebrow={filtered?'YOUR SEARCH RESULTS':'CURATED FOR DISCOVERY'}
            title={filtered?'Matching events':'Explore what’s next'}
            subtitle={`${filtered && searchTotal!==null ? searchTotal : visibleUpcoming.length} published events to explore`} />
          {filtered && searchBusy ? (
            <View style={styles.searchStatus}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text style={styles.searchStatusText}>Searching all published events…</Text>
            </View>
          ) : null}
          {filtered && searchError ? (
            <View><Text style={styles.searchError} accessibilityRole="alert">Event search could not be completed. No stale results are shown.</Text>
              <Pressable accessibilityRole="button" style={styles.searchRetry} onPress={()=>setRetryFilters(n=>n+1)}><Text style={styles.searchRetryText}>Try search again</Text></Pressable>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        filtered && (searchBusy || searchError) ? null : <View style={styles.filterEmpty}>
          <Text style={styles.emptyTitle}>{filtered ? 'No matching events' : 'No upcoming events yet'}</Text>
          <Text style={styles.errorBody}>{filtered ? 'Try another search or category to explore more gatherings.' : 'Organizers will appear here as they publish real experiences. Explore the live and social sections in the meantime.'}</Text>
          {filtered ? <Pressable style={styles.retryButton} accessibilityRole="button" onPress={resetFilters}>
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
      ListFooterComponent={filtered && searchTotal!==null && (serverResults?.length??0)<searchTotal ?
        <View>{loadMoreError ? <Text style={styles.searchError} accessibilityRole="alert">Could not load more events. Your existing results are preserved.</Text> : null}
          <Pressable accessibilityRole="button" disabled={loadingMore} style={styles.loadMore} onPress={() => void loadMore()}>
            <Text style={styles.loadMoreText}>{loadingMore ? 'Loading more…' : loadMoreError ? 'Retry loading more' : 'Load more events'}</Text>
          </Pressable></View> : null}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />
      }
    />
    <DiscoverFilterSheet visible={filterOpen} filters={activeFilters} categories={state.home.categories}
      countries={countries} onClose={()=>setFilterOpen(false)} onApply={next=>{
        setSearch(next.q);setCategory(next.category || 'all')
        setAdvanced({country:next.country,city:next.city,mode:next.mode,price:next.price,when:next.when})
        setFilterOpen(false)
        listRef.current?.scrollToOffset({offset:0,animated:true})
      }} />
    </View>
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
      <View style={styles.posterTopLabel}><Text style={styles.posterTopText}>iEVENTPLUX  ·  EXPERIENCE</Text></View>
      <View style={styles.eventPosterInfo}><Text style={styles.eventPosterInfoText}>{formatDate(event.startsAt)} · {event.city || (event.mode === 'VIRTUAL' || event.mode === 'ONLINE' ? 'Online' : 'Location TBA')}</Text></View>
    </View>
    <View style={styles.cardBody}>
      <View style={styles.eventTextRow}>
        <View style={{flex:1}}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>By {event.org.name}</Text>
        </View>
        <View style={styles.arrowBox}><Text style={styles.arrowText}>↗</Text></View>
      </View>
      <View style={styles.cardFooter}>
        <LabelPill label={event.mode === 'VIRTUAL' || event.mode === 'ONLINE' ? 'Online event' : event.mode === 'HYBRID' ? 'Hybrid experience' : 'In person'} />
        <Text style={styles.price}>{priceLabel}</Text>
      </View>
    </View>
  </Pressable>
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.colors.bg },
  listContent: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 38 },
  introRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  introLabel: { color: theme.colors.primary, fontSize: 10, letterSpacing: 1.7, fontWeight: '900', marginBottom: 6 },
  introTitle: { color: theme.colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -1.0 },
  liveShortcut: { backgroundColor: '#f9eeee', borderRadius: 100, paddingHorizontal: 13, minHeight: 37, justifyContent: 'center' },
  liveShortcutText: { color: '#a73530', fontSize: 10, fontWeight: '900', letterSpacing: .2 },
  hero: { backgroundColor: '#073e3b', borderRadius: 30, paddingHorizontal: 23, paddingTop: 30, paddingBottom: 19, marginBottom: 26, overflow: 'hidden', shadowColor: '#053a39', shadowOpacity:.24, shadowOffset:{width:0,height:13}, shadowRadius:20, elevation:7 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroDot: { width: 7, height: 7, backgroundColor: '#f3c464', borderRadius: 4 },
  heroKicker: { color: '#d8fbe9', fontSize: 10, fontWeight: '900', letterSpacing: 1.15, flexShrink: 1 },
  heroTitle: { color: '#ffffff', fontSize: 34, fontWeight: '900', letterSpacing: -1.5, lineHeight: 40, maxWidth:320 },
  heroAccent: { color: '#caf8dc', fontSize: 34, fontWeight: '900', letterSpacing: -1.5, lineHeight: 40 },
  heroBody: { color: '#e2f2ee', fontSize: 14, lineHeight: 22, marginTop: 17, maxWidth:340 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 17, gap: 18 },
  heroStat: { alignItems: 'flex-start' },
  heroStatValue: { color: '#ffffff', fontWeight: '900', fontSize: 20 },
  heroStatLabel: { color: '#b9dccd', fontSize: 10, fontWeight: '600', marginTop: 2 },
  heroStatDivider: { height: 25, borderLeftWidth: 1, borderLeftColor: '#7caf9f' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 },
  shopHeroButton: { flex: 1, minWidth: 120, minHeight: 51, borderRadius: 15, backgroundColor: '#e7faed', justifyContent: 'center', alignItems: 'center' },
  shopHeroText: { fontSize: 12, fontWeight: '800', color: '#075c3d' },
  organizerButton: { flex: 1, minWidth: 120, minHeight: 51, borderRadius: 15, borderWidth: 1, borderColor: '#8bc7b5', backgroundColor:'#ffffff12', justifyContent: 'center', alignItems: 'center' },
  organizerButtonText: { color: '#e3f7ed', fontSize: 12, fontWeight: '800' },
  hostAction: { alignSelf:'flex-start', minHeight:42, justifyContent:'center', marginTop:4 },
  hostText: { color:'#e5f8f2',fontSize:12,fontWeight:'800' },
  heroControls: { flexDirection:'row',alignItems:'center',marginTop:7,gap:2 },
  heroControlTouch:{width:32,height:35,justifyContent:'center',alignItems:'center'},
  heroControlDot:{width:9,height:6,borderRadius:4,backgroundColor:'#63988c'},
  heroControlActive:{width:23,backgroundColor:'#b2e7d5'},
  heroPause:{minHeight:36,marginLeft:5,justifyContent:'center',paddingHorizontal:6},
  heroPauseText:{fontWeight:'800',color:'#d2e9e5',fontSize:10},
  heroFeatured:{marginTop:17,borderRadius:17,backgroundColor:'#ffffff22',borderWidth:1,borderColor:'#ffffff44',padding:10,flexDirection:'row',alignItems:'center',gap:10},
  heroFeaturedImage:{height:43,width:43,borderRadius:9,backgroundColor:'#30685a'},
  heroFeaturedText:{flex:1},heroFeaturedLabel:{color:'#abddce',fontSize:10,fontWeight:'800',letterSpacing:1.0},
  heroFeaturedTitle:{color:'#ffffff',fontSize:12,fontWeight:'800',marginTop:3},
  heroFeaturedArrow:{color:'#d5f3e5',fontSize:22,fontWeight:'700'},
  heroFeatureSymbol:{height:43,width:43,overflow:'hidden',backgroundColor:'#ffffff18',borderRadius:10,textAlign:'center',textAlignVertical:'center',color:'#d5f3e5',fontSize:23},
  searchField: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, minHeight: 58, marginBottom: 14, paddingHorizontal: 15, shadowColor:mobileDesign.shadow,shadowOpacity:.04,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:1 },
  searchIcon: { fontSize: 26, color: theme.colors.primary, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 12 },
  clearSearch: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: theme.colors.textMuted, fontSize: 25 },
  filterControls:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:12},
  filterButton:{minHeight:42,borderRadius:12,backgroundColor:theme.web.tealSoft,borderColor:theme.colors.primary,borderWidth:1,paddingHorizontal:14,justifyContent:'center'},
  filterButtonText:{fontSize:12,fontWeight:'900',color:theme.colors.primary},
  quickFilters:{alignItems:'center',gap:7,paddingRight:12},
  quickChip:{minHeight:40,borderRadius:13,borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff',paddingHorizontal:12,justifyContent:'center'},
  quickSelected:{backgroundColor:theme.colors.primary,borderColor:theme.colors.primary},
  quickText:{fontSize:11,color:theme.colors.text,fontWeight:'700'},
  quickTextSelected:{color:'#fff'},
  activeFilterBanner:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:12},
  activeFilterLabel:{color:theme.colors.textMuted,fontSize:11,flex:1},
  clearFilterLabel:{color:theme.colors.primary,fontWeight:'800',fontSize:12},
  searchError:{fontSize:12,color:theme.colors.danger,marginBottom:9},
  searchRetry:{minHeight:42,alignSelf:'flex-start',paddingHorizontal:15,backgroundColor:theme.web.tealSoft,borderRadius:12,justifyContent:'center',marginBottom:15},
  searchRetryText:{fontSize:12,fontWeight:'800',color:theme.colors.primary},
  loadMore:{minHeight:47,borderWidth:1,borderColor:theme.colors.border,borderRadius:14,backgroundColor:'#fff',marginTop:7,alignItems:'center',justifyContent:'center'},
  loadMoreText:{fontSize:13,color:theme.colors.primary,fontWeight:'800'},
  categoryScroll: { marginBottom: 27 },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  searchStatusText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 19, marginBottom: 10 },
  categoryRow: { gap: 8, paddingBottom: 3 },
  categoryPill: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10, minHeight: 42, justifyContent: 'center' },
  categoryPillSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  categoryText: { color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 },
  categoryTextSelected: { color: '#ffffff' },
  sectionBlock: { marginBottom: 29 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.25 },
  sectionCount: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  livePill: { color: theme.colors.danger, fontWeight: '800', fontSize: 10 },
  featuredCard: { borderRadius: 26, backgroundColor: '#061b28', overflow: 'hidden', elevation: 5, minHeight:250, shadowColor:mobileDesign.shadow,shadowOpacity:.13,shadowRadius:16,shadowOffset:{width:0,height:10} },
  featuredImage: { width: '100%',height: 274,resizeMode: 'cover' },
  featuredTint: { position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:'rgba(3,20,29,.56)' },
  featuredChip:{position:'absolute',top:14,left:14,backgroundColor:'#101b25bf',borderRadius:18,paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:'#ffffff55'},
  featuredBody: {position:'absolute',left:0,right:0,bottom:0,padding:16},
  featuredLabel: {fontSize:10,fontWeight:'900',color:'#fff',letterSpacing:1.1},
  featuredTitle: {color:'#fff',fontWeight:'900',fontSize:24,lineHeight:30,marginTop:8,letterSpacing:-.5},
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },
  poster: { width: '100%',height: 206,resizeMode: 'cover' },
  posterTopLabel:{position:'absolute',top:13,left:13,backgroundColor:'#091c2fae',borderRadius:10,paddingHorizontal:10,paddingVertical:7,borderWidth:1,borderColor:'#ffffff3c'},
  posterTopText:{fontSize:9,color:'#ffffff',fontWeight:'900',letterSpacing:1},
  eventTextRow:{flexDirection:'row',alignItems:'center',gap:10},
  arrowBox:{width:38,height:38,borderRadius:13,backgroundColor:mobileDesign.mintSoft,justifyContent:'center',alignItems:'center'},
  arrowText:{fontSize:21,fontWeight:'800',color:mobileDesign.emerald},
  eventPosterWrap: {position:'relative',backgroundColor:'#0d5349'},
  eventPosterShade:{position:'absolute',left:0,right:0,bottom:0,height:46,backgroundColor:'#091b28a8'},
  eventPosterInfo:{position:'absolute',left:12,bottom:11},
  eventPosterInfoText:{color:'#fff',fontWeight:'800',fontSize:12},
  posterPlaceholder: { backgroundColor: theme.colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.sm },
  posterPlaceholderText: { color: '#ffffff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cardBody:{padding:17},
  cardFooter:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18},
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
