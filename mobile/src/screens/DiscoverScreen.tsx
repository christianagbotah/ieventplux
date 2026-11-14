/**
 * Discover — GET /api/v1/discovery/home.
 *
 * Flat list of upcoming events (poster, title, date, price) with pull-to-refresh,
 * loading / error / empty states. Tapping a row opens EventDetail.
 */

import { useCallback, useEffect, useState } from 'react'
import {
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
import {
  ApiClientError,
  api,
  formatDate,
  minPriceLabel,
  type DiscoveryEventCard,
  type DiscoveryHome,
} from '../api/client'
import { theme } from '../theme'
import type { DiscoverScreenProps } from '../navigation'

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; home: DiscoveryHome }
  | { status: 'ready'; home: DiscoveryHome }

export default function DiscoverScreen({ navigation }: DiscoverScreenProps) {
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerAction}
            onPress={() => navigation.navigate('MyTickets')}
            accessibilityRole="button"
            accessibilityLabel="My tickets"
          >
            <Text style={styles.headerActionText}>Tickets</Text>
          </Pressable>
          <Pressable
            style={styles.headerAction}
            onPress={() => navigation.navigate('Checkin')}
            accessibilityRole="button"
            accessibilityLabel="Open check-in scanner"
          >
            <Text style={styles.headerActionText}>Scan</Text>
          </Pressable>
        </View>
      ),
    })
  }, [navigation])

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

  if (state.status === 'empty') {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No upcoming events yet</Text>
        <Text style={styles.errorBody}>Check back soon — organizers publish new events regularly.</Text>
      </View>
    )
  }

  const liveNow = state.home.liveNow.filter((e) => e.broadcasts.some((b) => b.status === 'LIVE'))
  const query = search.trim().toLocaleLowerCase()
  const visibleUpcoming = state.home.upcoming.filter((event) => {
    const matchesCategory = category === 'all' || event.categorySlug === category
    const searchable = [event.title, event.org.name, event.city ?? '', event.categorySlug ?? ''].join(' ').toLocaleLowerCase()
    return matchesCategory && (!query || searchable.includes(query))
  })
  const featured = state.home.featured[0]

  return (
    <FlatList<DiscoveryEventCard>
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visibleUpcoming}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>EVENTS. PEOPLE. EXPERIENCES.</Text>
            <Text style={styles.heroTitle}>Make room for moments that matter.</Text>
            <Text style={styles.heroBody}>Discover gatherings across Ghana, reserve your place and keep every ticket close.</Text>
            <Text style={styles.heroStats}>{state.home.stats.upcomingEvents} upcoming · {state.home.stats.organizers} organizers · {state.home.stats.liveNow} live</Text>
          </View>

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

          {featured && !query && category === 'all' ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Featured experience</Text></View>
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
            <Text style={styles.sectionTitle}>{query || category !== 'all' ? 'Matching events' : 'Coming up'}</Text>
            <Text style={styles.sectionCount}>{visibleUpcoming.length} events</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.filterEmpty}>
          <Text style={styles.emptyTitle}>No matching events</Text>
          <Text style={styles.errorBody}>Try another search or category to explore more gatherings.</Text>
          <Pressable style={styles.retryButton} accessibilityRole="button" onPress={() => { setSearch(''); setCategory('all') }}>
            <Text style={styles.retryButtonText}>Clear filters</Text>
          </Pressable>
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
  return (
    <Pressable
      style={({ pressed }) => [styles.featuredCard, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View featured event ${event.title}`}
    >
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={styles.featuredImage} accessibilityLabel={`${event.title} artwork`} />
      ) : (
        <View style={[styles.featuredImage, styles.posterPlaceholder]}>
          <Text style={styles.posterPlaceholderText}>{event.title}</Text>
        </View>
      )}
      <View style={styles.featuredBody}>
        <Text style={styles.featuredLabel}>CURATED FOR YOU</Text>
        <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.featuredMeta} numberOfLines={2}>{formatDate(event.startsAt)} · {event.city ?? 'Location TBA'}</Text>
        <Text style={styles.featuredAction}>Explore event  ›</Text>
      </View>
    </Pressable>
  )
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
  const priceLabel = minPriceLabel((event.ticketTypes ?? []).map((t) => t.priceMinor))
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open event ${event.title}`}
    >
      {event.coverImageUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- React Native Image uses accessibility props, not alt
        <Image source={{ uri: event.coverImageUrl }} style={styles.poster} accessibilityLabel={`${event.title} artwork`} />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]}>
          <Text style={styles.posterPlaceholderText} numberOfLines={3}>
            {event.title}
          </Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDate(event.startsAt)} · {event.city ?? 'Location TBA'} · {event.org.name}
        </Text>
        <Text style={styles.price}>{priceLabel}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.colors.bg },
  listContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  hero: { backgroundColor: theme.colors.primaryDark, borderRadius: 24, padding: 24, marginBottom: 18 },
  heroKicker: { color: '#a9e6d0', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  heroTitle: { color: '#ffffff', fontSize: 29, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  heroBody: { color: '#cfe9e0', fontSize: 13, lineHeight: 20, marginTop: 12 },
  heroStats: { color: '#d2f5e8', fontSize: 11, fontWeight: '700', marginTop: 16 },
  searchField: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, minHeight: 52, marginBottom: 12, paddingHorizontal: 14 },
  searchIcon: { fontSize: 26, color: theme.colors.primary, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, paddingVertical: 12 },
  clearSearch: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: theme.colors.textMuted, fontSize: 25 },
  categoryScroll: { marginBottom: 22 },
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
  featuredCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, overflow: 'hidden' },
  featuredImage: { width: '100%', height: 176, resizeMode: 'cover' },
  featuredBody: { padding: 16 },
  featuredLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.primary, letterSpacing: 1.1, marginBottom: 5 },
  featuredTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 19 },
  featuredMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 6 },
  featuredAction: { color: theme.colors.primary, fontWeight: '800', marginTop: 10, fontSize: 13 },
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
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },
  poster: { width: 108, height: 108, resizeMode: 'cover' },
  posterPlaceholder: { backgroundColor: theme.colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.sm },
  posterPlaceholderText: { color: '#ffffff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cardBody: { flex: 1, padding: theme.spacing.md, justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: 12, marginTop: theme.spacing.xs },
  price: { color: theme.colors.primary, fontWeight: '700', marginTop: theme.spacing.xs },
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
