/**
 * My tickets — GET /api/v1/tickets, then GET /api/v1/tickets/{id} for the QR.
 *
 * Each row opens a TicketQrModal that fetches the server payload for that
 * ticket. The server returns `qrPayload` ("IEVX1.<ticketId>.<hmac>" — no
 * personal data inside the QR) plus a server-rendered `qrSvg`. On mobile we
 * render the QR natively from `qrPayload` with react-native-qrcode-svg
 * (backed by react-native-svg), which keeps the credential identical to the
 * one the venue scanners verify server-side (HMAC checked at scan time).
 *
 * `orderRef` route param: set by the ieventplux://order/{ref} deep link return
 * from hosted checkout. It only surfaces a banner + refresh — tickets appear
 * once the server confirms payment via provider callbacks (never client-side).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import {
  ApiClientError,
  api,
  formatDate,
  formatDateTime,
  type TicketDetail,
  type TicketSummary,
} from '../api/client'
import { theme } from '../theme'
import { useSession } from '../store/session'
import type { MyTicketsScreenProps } from '../navigation'

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; items: TicketSummary[] }

const STATUS_COLORS: Record<string, string> = {
  VALID: theme.colors.success,
  CHECKED_IN: theme.colors.warning,
  REFUNDED: theme.colors.danger,
  REVOKED: theme.colors.danger,
  TRANSFERRED: theme.colors.textMuted,
}

export default function MyTicketsScreen({ navigation, route }: MyTicketsScreenProps) {
  const { signOut } = useSession()
  const orderRef = route.params?.orderRef
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [qrTicketId, setQrTicketId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    try {
      const page = await api.tickets.list()
      setState(page.items.length === 0 ? { status: 'empty' } : { status: 'ready', items: page.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load your tickets.',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Deep-link payment return: give the server a moment to process the provider
  // callback, then refresh. (Honest limitation: this is a pragmatic single-shot
  // retry, not a robust poll — see README "What remains".)
  useEffect(() => {
    if (!orderRef) return
    const timer = setTimeout(() => void load(), 4000)
    return () => clearTimeout(timer)
  }, [orderRef, load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const page = await api.tickets.list()
      setState(page.items.length === 0 ? { status: 'empty' } : { status: 'ready', items: page.items })
    } catch {
      // Keep the current list on transient refresh failures.
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void handleSignOut()} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text style={styles.headerActionText}>Sign out</Text>
        </Pressable>
      ),
    })
    // handleSignOut captures navigation+signOut; both are stable enough here.
  }, [navigation, signOut])

  return (
    <View style={styles.screen}>
      {orderRef ? (
        <View style={styles.returnBanner}>
          <Text style={styles.returnBannerText}>
            Payment return for order {orderRef} — tickets appear once payment is confirmed
            server-side. This screen refreshes automatically a few seconds after return.
          </Text>
          <Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Refresh tickets now">
            <Text style={styles.returnBannerAction}>Refresh now</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load tickets</Text>
          <Text style={styles.mutedCenter}>{state.message}</Text>
        </View>
      ) : state.status === 'empty' ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No tickets yet</Text>
          <Text style={styles.mutedCenter}>
            Paid orders issue tickets after checkout confirmation — pull to refresh after paying.
          </Text>
        </View>
      ) : (
        <FlatList<TicketSummary>
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={state.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              onPress={() => setQrTicketId(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />
          }
        />
      )}

      <TicketQrModal ticketId={qrTicketId} onClose={() => setQrTicketId(null)} />
    </View>
  )
}

function TicketRow({ ticket, onPress }: { ticket: TicketSummary; onPress: () => void }) {
  const statusColor = STATUS_COLORS[ticket.status] ?? theme.colors.textMuted
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show QR for ticket ${ticket.code}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {ticket.event.title}
          </Text>
          <Text style={styles.cardMeta}>
            {formatDate(ticket.event.startsAt)} · {ticket.ticketType.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {ticket.event.venue ? `${ticket.event.venue.name} · ` : ''}
            {ticket.event.org.name}
          </Text>
        </View>
        <View style={[styles.statusChip, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{ticket.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.cardCode}>{ticket.code}</Text>
      <Text style={styles.cardHint}>Tap to show the QR credential</Text>
    </Pressable>
  )
}

function TicketQrModal({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticketId) {
      setDetail(null)
      setError(null)
      return
    }
    let cancelled = false
    setDetail(null)
    setError(null)
    api.tickets
      .get(ticketId)
      .then((res) => {
        if (!cancelled) setDetail(res.ticket)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load the ticket QR.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  if (!ticketId) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {detail ? (
            <>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {detail.event.title}
              </Text>
              <Text style={styles.modalMeta}>
                {formatDateTime(detail.event.startsAt)} · {detail.ticketType.name}
              </Text>
              <View style={styles.qrBox}>
                {/*
                  QR rendered natively from the server's qrPayload
                  ("IEVX1.<ticketId>.<hmac>"). The server also returns qrSvg —
                  kept in the payload for parity, but react-native-qrcode-svg
                  renders the same credential as the web app.
                */}
                <QRCode value={detail.qrPayload} size={220} color={theme.colors.text} backgroundColor="#ffffff" />
              </View>
              <Text style={styles.modalCode}>{detail.code}</Text>
              <Text style={styles.modalPayload} numberOfLines={1} selectable>
                {detail.qrPayload}
              </Text>
              <Text style={styles.modalNote}>
                {detail.holderName} · status {detail.status}
                {detail.seatInfo ? ` · ${detail.seatInfo}` : ''}
              </Text>
              <Pressable style={styles.modalClose} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close ticket QR">
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </>
          ) : error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load the QR</Text>
              <Text style={styles.mutedCenter}>{error}</Text>
              <Pressable style={styles.modalClose} onPress={onClose} accessibilityRole="button">
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  list: { flex: 1 },
  listContent: { padding: theme.spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  headerActionText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  returnBanner: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    margin: theme.spacing.lg,
  },
  returnBannerText: { color: '#065f46', fontSize: 12 },
  returnBannerAction: { color: theme.colors.primaryDark, fontWeight: '700', marginTop: theme.spacing.sm },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  cardPressed: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitleBlock: { flex: 1, paddingRight: theme.spacing.sm },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 12 },
  statusChip: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardCode: { marginTop: theme.spacing.md, color: theme.colors.text, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12 },
  cardHint: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,25,23,0.6)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  modalMeta: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' },
  qrBox: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalCode: { marginTop: theme.spacing.lg, color: theme.colors.text, fontWeight: '700', letterSpacing: 1 },
  modalPayload: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 10 },
  modalNote: { marginTop: theme.spacing.sm, color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' },
  modalClose: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    minWidth: 120,
    alignItems: 'center',
  },
  modalCloseText: { color: '#ffffff', fontWeight: '700' },
  modalLoading: { paddingVertical: theme.spacing.xxl },
  errorTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.sm },
  emptyTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.sm },
  mutedCenter: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' },
})
