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
} from '../api/client'
import { theme } from '../theme'
import type { DiscoverScreenProps } from '../navigation'

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; items: DiscoveryEventCard[] }

export default function DiscoverScreen({ navigation }: DiscoverScreenProps) {
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const home = await api.discovery.home()
      setState(home.upcoming.length === 0 ? { status: 'empty' } : { status: 'ready', items: home.upcoming })
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
      setState(home.upcoming.length === 0 ? { status: 'empty' } : { status: 'ready', items: home.upcoming })
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

  return (
    <FlatList<DiscoveryEventCard>
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={state.items}
      keyExtractor={(item) => item.id}
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
