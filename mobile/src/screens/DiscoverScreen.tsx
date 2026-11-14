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

  return (
    <FlatList<DiscoveryEventCard>
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={state.home.upcoming}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        liveNow.length > 0 ? (
          <View style={styles.liveSection}>
            <Text style={styles.liveSectionTitle}>Live now</Text>
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
        ) : null
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
  listContent: { padding: theme.spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, backgroundColor: theme.colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { paddingHorizontal: theme.spacing.sm },
  headerActionText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  liveSection: { marginBottom: theme.spacing.lg },
  liveSectionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: theme.spacing.sm },
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
  cardBody: { flex: 1, padding: theme.spacing.md },
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
