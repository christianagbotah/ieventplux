/**
 * Event detail — GET /api/v1/events/{id|slug} → ticket types → checkout.
 *
 * Purchase flow (POST /api/v1/orders, then POST /api/v1/payments/initiate):
 *  1. POST /orders reserves inventory and returns `orderReference`
 *     (status PENDING_PAYMENT for paid orders; DRAFT for free RSVP-style ones).
 *  2. POST /payments/initiate returns `checkoutUrl` — Hubtel's hosted checkout
 *     page (or the dev simulator, which returns a relative URL the client
 *     resolves against the API base).
 *  3. We open it in the system browser with Linking.openURL. Payment state only
 *     ever changes via provider callbacks/reconciliation server-side — never
 *     via the return URL. When the deployment is configured to do so, the
 *     browser returns to the app through the `ieventplux://order/{reference}`
 *     deep link (handled in App.tsx's linking config → MyTickets).
 *  4. Free orders skip payment: tickets are issued straight to My tickets.
 *
 * Store-billing honesty note: physical event tickets may be sold via Hubtel
 * hosted checkout (external browser). Digital-only access/subscriptions sold
 * inside a native app require Apple/Google store billing — see
 * docs/NATIVE_MODULES.md. No in-app purchase code exists in this scaffold.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  ApiClientError,
  absoluteUrl,
  api,
  formatDateTime,
  formatMinor,
  type EventDetailResponse,
  type TicketType,
} from '../api/client'
import { theme } from '../theme'
import type { EventDetailScreenProps } from '../navigation'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EventDetailResponse }

export default function EventDetailScreen({ navigation, route }: EventDetailScreenProps) {
  const { eventId } = route.params
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  /** ticketTypeId → selected quantity (bounded by perBuyerLimit server-side too). */
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [buying, setBuying] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const data = await api.events.get(eventId)
      setState({ status: 'ready', data })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load this event.',
      })
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  const setQty = (tt: TicketType, next: number) => {
    setQuantities((prev) => {
      const current = prev[tt.id] ?? 0
      const upper = Math.max(1, tt.perBuyerLimit)
      const bounded = Math.max(0, Math.min(upper, next))
      return bounded === current ? prev : { ...prev, [tt.id]: bounded }
    })
  }

  const selectedItems = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.data.event.ticketTypes
      .map((tt) => ({ tt, qty: quantities[tt.id] ?? 0 }))
      .filter(({ qty }) => qty > 0)
  }, [state, quantities])

  const estimatedMinor = useMemo(
    () => selectedItems.reduce((sum, { tt, qty }) => sum + tt.priceMinor * qty, 0),
    [selectedItems]
  )

  const buy = async () => {
    if (state.status !== 'ready') return
    if (selectedItems.length === 0) {
      Alert.alert('Select tickets', 'Choose at least one ticket type and quantity first.')
      return
    }
    setBuying(true)
    try {
      const order = await api.orders.create({
        eventId: state.data.event.id,
        items: selectedItems.map(({ tt, qty }) => ({ ticketTypeId: tt.id, qty })),
      })

      if (order.kind === 'FREE' || order.status !== 'PENDING_PAYMENT') {
        Alert.alert(
          'Reservation placed',
          `Order ${order.orderReference} is confirmed. Your tickets are in My tickets.`
        )
        navigation.navigate('MyTickets')
        return
      }

      const payment = await api.payments.initiate(order.orderReference)
      const checkout = absoluteUrl(payment.checkoutUrl)
      if (!checkout) {
        throw new ApiClientError('NO_CHECKOUT_URL', 'The server did not return a usable checkout URL.', 0)
      }
      await Linking.openURL(checkout)
      Alert.alert(
        'Checkout opened',
        `Complete payment for ${order.orderReference} in your browser. When the provider returns you to the app (ieventplux://order/${order.orderReference}), My tickets will refresh — tickets appear after the payment is confirmed server-side.`
      )
    } catch (err) {
      Alert.alert(
        'Checkout failed',
        err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Unexpected error during checkout.'
      )
    } finally {
      setBuying(false)
    }
  }

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
        <Text style={styles.errorTitle}>Event unavailable</Text>
        <Text style={styles.mutedCenter}>{state.message}</Text>
        <Pressable style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    )
  }

  const { event, stats, canManage } = state.data
  const currency = event.ticketTypes.find((tt) => tt.priceMinor > 0)?.currency ?? 'GHS'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>{event.title}</Text>
        </View>
      )}

      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.meta}>
        {formatDateTime(event.startsAt)} · {event.city ?? 'Location TBA'} · by {event.org.name}
      </Text>
      <Text style={styles.meta}>
        {event.venue ? `${event.venue.name} — ${event.venue.city ?? ''}` : 'Venue TBA'} · {stats.going} going
      </Text>
      {event.summary ? <Text style={styles.summary}>{event.summary}</Text> : null}
      <Text style={styles.description}>{event.description}</Text>

      <Text style={styles.sectionTitle}>Tickets</Text>
      {event.ticketTypes.length === 0 ? (
        <Text style={styles.muted}>No ticket types are on sale for this event yet.</Text>
      ) : (
        event.ticketTypes.map((tt) => (
          <TicketTypeRow
            key={tt.id}
            ticketType={tt}
            qty={quantities[tt.id] ?? 0}
            onDecrement={() => setQty(tt, (quantities[tt.id] ?? 0) - 1)}
            onIncrement={() => setQty(tt, (quantities[tt.id] ?? 0) + 1)}
          />
        ))
      )}

      <Pressable
        style={[styles.buyButton, (buying || selectedItems.length === 0) && styles.buyButtonDisabled]}
        onPress={() => void buy()}
        disabled={buying || selectedItems.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Buy tickets"
      >
        {buying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buyButtonText}>
            {selectedItems.length === 0
              ? 'Select tickets to continue'
              : estimatedMinor === 0
                ? 'Reserve — Free'
                : `Buy — ${formatMinor(estimatedMinor, currency)}`}
          </Text>
        )}
      </Pressable>
      <Text style={styles.footnote}>
        Paid checkout opens Hubtel's hosted page in your browser. The app returns via
        ieventplux://order/{`{reference}`} — payment confirmation always comes from the
        server (provider callbacks), never from the return link alone.
      </Text>

      {canManage ? (
        <Pressable
          style={styles.staffButton}
          onPress={() => navigation.navigate('Checkin', { eventId: event.id })}
          accessibilityRole="button"
          accessibilityLabel="Open check-in scanner for this event"
        >
          <Text style={styles.staffButtonText}>Open check-in scanner (staff)</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function TicketTypeRow({
  ticketType,
  qty,
  onDecrement,
  onIncrement,
}: {
  ticketType: TicketType
  qty: number
  onDecrement: () => void
  onIncrement: () => void
}) {
  const price =
    ticketType.priceMinor === 0 ? 'Free' : formatMinor(ticketType.priceMinor, ticketType.currency)
  const remaining = ticketType.quota > 0 ? ticketType.quota - ticketType.soldCount - ticketType.reservedCount : null
  return (
    <View style={styles.ticketRow}>
      <View style={styles.ticketInfo}>
        <Text style={styles.ticketName}>{ticketType.name}</Text>
        {ticketType.description ? (
          <Text style={styles.ticketDescription} numberOfLines={2}>
            {ticketType.description}
          </Text>
        ) : null}
        <Text style={styles.ticketPrice}>{price}</Text>
        {remaining !== null && remaining <= 10 ? (
          <Text style={styles.ticketLowStock}>Only {Math.max(0, remaining)} left</Text>
        ) : null}
      </View>
      <View style={styles.qtyControls}>
        <Pressable style={styles.qtyButton} onPress={onDecrement} disabled={qty === 0} accessibilityRole="button" accessibilityLabel={`Remove one ${ticketType.name}`}>
          <Text style={styles.qtyButtonText}>–</Text>
        </Pressable>
        <Text style={styles.qtyValue}>{qty}</Text>
        <Pressable
          style={styles.qtyButton}
          onPress={onIncrement}
          disabled={remaining !== null && remaining <= 0}
          accessibilityRole="button"
          accessibilityLabel={`Add one ${ticketType.name}`}
        >
          <Text style={styles.qtyButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.bg, flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, backgroundColor: theme.colors.bg },
  cover: { width: '100%', height: 200, borderRadius: theme.radius.lg, backgroundColor: theme.colors.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryDark, padding: theme.spacing.lg },
  coverPlaceholderText: { color: '#ffffff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  title: { marginTop: theme.spacing.lg, fontSize: 22, fontWeight: '700', color: theme.colors.text },
  meta: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 13 },
  summary: { marginTop: theme.spacing.lg, color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  description: { marginTop: theme.spacing.md, color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
  sectionTitle: { marginTop: theme.spacing.xxl, marginBottom: theme.spacing.md, fontSize: 16, fontWeight: '700', color: theme.colors.text },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  ticketInfo: { flex: 1 },
  ticketName: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  ticketDescription: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 12 },
  ticketPrice: { marginTop: theme.spacing.xs, color: theme.colors.primary, fontWeight: '700' },
  ticketLowStock: { marginTop: theme.spacing.xs, color: theme.colors.accent, fontSize: 12, fontWeight: '600' },
  qtyControls: { flexDirection: 'row', alignItems: 'center' },
  qtyButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { color: theme.colors.primaryDark, fontSize: 18, fontWeight: '700' },
  qtyValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '700', color: theme.colors.text },
  buyButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  buyButtonDisabled: { opacity: 0.55 },
  buyButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  staffButton: {
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  staffButtonText: { color: theme.colors.primaryDark, fontWeight: '600' },
  footnote: { marginTop: theme.spacing.md, color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' },
  errorTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700', marginBottom: theme.spacing.sm },
  muted: { color: theme.colors.textMuted, fontSize: 13 },
  mutedCenter: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryButton: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  retryButtonText: { color: '#ffffff', fontWeight: '700' },
})
