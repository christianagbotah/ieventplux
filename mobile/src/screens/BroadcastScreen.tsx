/**
 * Broadcast viewer — live + replay, entitlement-honest.
 *
 * Server contract (mirrors the web portal's BroadcastView):
 *  - GET  /broadcasts/{id}/detail → broadcast + viewer access verdict +
 *    replay surface + delivery mode (SYNTHETIC while Cloudflare Stream
 *    credentials are absent — entitlements, tokens and sessions are fully
 *    enforced either way).
 *  - POST /broadcasts/{id}/play → entitlement check → short-lived playback
 *    token (10 min, LIVE or REPLAY mode). Gates surface verbatim:
 *    ENTITLEMENT_REQUIRED (402), ROOM_FULL (409 capacity), sign-in required.
 *  - POST /broadcasts/{id}/heartbeat → keeps the session alive; the server
 *    counts heartbeat-fresh sessions against viewerCapacity for live rooms.
 *  - Chat: GET history (viewers read VISIBLE only — server-filtered) and
 *    POST send (LIVE broadcasts only, server-enforced). The web app gets
 *    realtime deltas over socket.io; mobile polls every 5 s while the
 *    screen is open — an honest, deliberately simple transport (each poll
 *    is the same filtered history the web renders).
 *
 * The player itself renders a SYNTHETIC stream (animated placeholder,
 * labelled "Simulated stream" exactly like the web's canvas PlayerSim) —
 * no real HLS exists until Cloudflare Stream is configured; when
 * delivery flips to CLOUDFLARE_STREAM this screen shows the delivery note
 * and the token/session chain is already correct for a native player.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ApiClientError,
  api,
  formatDateTime,
  formatMinor,
  type BroadcastChatMessage,
  type PlaybackIssueResponse,
} from '../api/client'
import { theme } from '../theme'
import { useSession } from '../store/session'
import type { BroadcastScreenProps } from '../navigation'

const HEARTBEAT_MS = 60_000
const CHAT_POLL_MS = 5_000

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Awaited<ReturnType<typeof api.broadcasts.detail>> }

type PlayState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'watching'; playback: PlaybackIssueResponse }
  | { status: 'gate'; code: string; message: string }

const ACCESS_COPY: Record<string, string> = {
  sign_in_required: 'Sign in to watch this broadcast.',
  expired_or_revoked: 'Your viewing access is no longer active for this broadcast.',
}

export default function BroadcastScreen({ route, navigation }: BroadcastScreenProps) {
  const broadcastId = route.params.broadcastId
  const { status: sessionStatus } = useSession()
  const [detailState, setDetailState] = useState<DetailState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [playState, setPlayState] = useState<PlayState>({ status: 'idle' })
  const [messages, setMessages] = useState<BroadcastChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setDetailState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    try {
      const data = await api.broadcasts.detail(broadcastId)
      setDetailState({ status: 'ready', data })
    } catch (err) {
      setDetailState({
        status: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load the broadcast.',
      })
    }
  }, [broadcastId])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await api.broadcasts.detail(broadcastId)
      setDetailState({ status: 'ready', data })
    } catch {
      // Keep the current view on transient refresh failures.
    } finally {
      setRefreshing(false)
    }
  }, [broadcastId])

  const isLive = detailState.status === 'ready' && detailState.data.broadcast.status === 'LIVE'
  const isReplayReady = detailState.status === 'ready' && detailState.data.replay.available
  const watching = playState.status === 'watching'

  const handlePlay = useCallback(async () => {
    if (playState.status === 'requesting' || watching) return
    setPlayState({ status: 'requesting' })
    try {
      const playback = await api.broadcasts.play(broadcastId)
      setPlayState({ status: 'watching', playback })
    } catch (err) {
      setPlayState({
        status: 'gate',
        code: err instanceof ApiClientError ? err.code : 'ERROR',
        message: err instanceof ApiClientError ? err.message : 'Could not start playback.',
      })
    }
  }, [broadcastId, watching, playState.status])

  // Heartbeat while watching — the server revokes stale sessions and counts
  // heartbeat-fresh viewers against the live room's capacity.
  useEffect(() => {
    if (playState.status !== 'watching') return
    const token = playState.playback.playbackToken
    const interval = setInterval(() => {
      void api.broadcasts
        .heartbeat(broadcastId, token)
        .then(() => undefined)
        .catch(() => {
          // Session expired/revoked mid-watch — fall back to the detail state.
          setPlayState({ status: 'idle' })
        })
    }, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [playState, broadcastId])

  // Chat history: initial load + 5 s poll while the screen is open (the web
  // app receives socket.io deltas; polling the same filtered history is the
  // mobile transport — simpler, equally honest).
  const chatSeqRef = useRef(0)
  const loadChat = useCallback(async () => {
    const seq = ++chatSeqRef.current
    try {
      const page = await api.broadcasts.chat(broadcastId)
      if (seq !== chatSeqRef.current) return // a newer poll already landed
      setMessages(page.items)
      setChatError(null)
    } catch {
      // Chat is secondary to playback — surface quietly, never block.
    }
  }, [broadcastId])

  useEffect(() => {
    void loadChat()
    const interval = setInterval(() => void loadChat(), CHAT_POLL_MS)
    return () => {
      clearInterval(interval)
      chatSeqRef.current += 1
    }
  }, [loadChat])

  const handleSend = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await api.broadcasts.chatSend(broadcastId, text)
      setChatInput('')
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]))
      setChatError(null)
    } catch (err) {
      setChatError(err instanceof ApiClientError ? err.message : 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }, [broadcastId, chatInput, sending])

  if (detailState.status === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (detailState.status === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load the broadcast</Text>
          <Text style={styles.mutedCenter}>{detailState.message}</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry loading broadcast">
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const { broadcast, access, replay, delivery, deliveryNote } = detailState.data
  const canWatch = isLive || isReplayReady
  const gateCopy =
    playState.status === 'gate'
      ? playState.message
      : ACCESS_COPY[access.reason ?? ''] ?? (access.allowed ? '' : 'This broadcast is not available to your account yet.')

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />}>
        <View style={styles.headerCard}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isLive ? styles.badgeLive : isReplayReady ? styles.badgeReplay : styles.badgeMuted]}>
              <Text style={[styles.badgeText, { color: '#ffffff' }]}>
                {isLive ? 'LIVE' : isReplayReady ? 'REPLAY' : broadcast.status}
              </Text>
            </View>
            <Text style={styles.viewerMeta}>
              {isLive ? `${broadcast.viewerCount} watching · cap ${broadcast.viewerCapacity}` : broadcast.status === 'ENDED' ? 'Ended' : 'Scheduled'}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {broadcast.title}
          </Text>
          <Text style={styles.meta}>
            {broadcast.event.org.name} · {formatDateTime(broadcast.event.startsAt)}
          </Text>
          <Text style={styles.accessMeta}>
            {broadcast.accessPolicy === 'FREE'
              ? 'Free to watch'
              : broadcast.accessPolicy === 'PAID'
                ? `Pass ${formatMinor(replay.effectivePriceMinor ?? broadcast.priceMinor ?? 0)}${isReplayReady ? ' (replay price)' : ''}`
                : broadcast.accessPolicy === 'TICKET_HOLDERS'
                  ? 'Ticket holders (with online access)'
                  : 'Invitation only'}
          </Text>
        </View>

        {/* Player surface */}
        {watching ? (
          <SimPlayer mode={playState.playback.mode} delivery={delivery} deliveryNote={deliveryNote} onLeave={() => setPlayState({ status: 'idle' })} />
        ) : canWatch ? (
          <View style={styles.playCard}>
            {playState.status === 'gate' && (
              <View style={styles.gateBox}>
                <Text style={styles.gateTitle}>Can't start playback</Text>
                <Text style={styles.gateBody}>{gateCopy}</Text>
                {(playState.code === 'ROOM_FULL' || playState.code === 'CONFLICT') && (
                  <Pressable style={styles.primaryButton} onPress={() => void handlePlay()} accessibilityRole="button" accessibilityLabel="Try again">
                    <Text style={styles.primaryButtonText}>Try again</Text>
                  </Pressable>
                )}
              </View>
            )}
            {playState.status !== 'gate' && (
              <>
                <Text style={styles.playTitle}>{isLive ? 'Join the live room' : 'Watch the replay'}</Text>
                <Text style={styles.playBody}>
                  {isLive
                    ? 'Entitlement checked, capacity enforced — your session stays alive with a periodic heartbeat.'
                    : `On-demand replay${replay.effectivePriceMinor !== null && replay.effectivePriceMinor > 0 ? ` · ${formatMinor(replay.effectivePriceMinor)}` : ''}.`}
                </Text>
                <Pressable
                  style={[styles.primaryButton, playState.status === 'requesting' && styles.buttonDisabled]}
                  disabled={playState.status === 'requesting'}
                  onPress={() => void handlePlay()}
                  accessibilityRole="button"
                  accessibilityLabel={isLive ? 'Join the live broadcast' : 'Start the replay'}
                >
                  {playState.status === 'requesting' ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{isLive ? 'Watch live' : 'Watch replay'}</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={styles.playCard}>
            <Text style={styles.playTitle}>
              {broadcast.status === 'ENDED' ? 'Replay not available yet' : 'Not live yet'}
            </Text>
            <Text style={styles.playBody}>
              {broadcast.status === 'ENDED'
                ? 'The recording is still processing. Check back later.'
                : 'This broadcast has not started. Pull to refresh once it goes live.'}
            </Text>
          </View>
        )}

        {/* Anonymous / unentitled gate (detail-level verdict) */}
        {!watching && !access.allowed && canWatch && playState.status !== 'gate' && (
          <View style={styles.gateBox}>
            <Text style={styles.gateTitle}>Access required</Text>
            <Text style={styles.gateBody}>
              {sessionStatus === 'anonymous' && access.reason === 'sign_in_required'
                ? 'Sign in to watch. '
                : ''}
              {gateCopy} You can still try — the server has the final say on entitlements, passes and tickets.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('EventDetail', { eventId: broadcast.eventId })}
              accessibilityRole="button"
              accessibilityLabel="Open the event for tickets and passes"
            >
              <Text style={styles.secondaryButtonText}>Open event (tickets & passes)</Text>
            </Pressable>
          </View>
        )}

        {/* Delivery honesty label */}
        <Text style={styles.deliveryNote}>{deliveryNote}</Text>

        {/* Chat / transcript */}
        <View style={styles.chatCard}>
          <Text style={styles.chatHeading}>
            {isLive ? 'Live chat' : 'Chat'} · {messages.length} message{messages.length === 1 ? '' : 's'}
          </Text>
          {!isLive && (
            <Text style={styles.chatClosedNote}>
              {broadcast.status === 'ENDED' ? 'Chat closed after the live session — read-only transcript.' : 'Chat opens when the broadcast goes live.'}
            </Text>
          )}
          {chatError ? <Text style={styles.chatError}>{chatError}</Text> : null}
          <FlatList<BroadcastChatMessage>
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.chatRow}>
                <Text style={styles.chatAuthor}>{item.user.displayName}</Text>
                <Text style={styles.chatBody}>{item.body}</Text>
              </View>
            )}
          />
          {isLive && sessionStatus === 'authenticated' && (
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Say something…"
                placeholderTextColor={theme.colors.textMuted}
                autoCorrect={false}
              />
              <Pressable
                style={[styles.chatSend, (sending || chatInput.trim().length === 0) && styles.buttonDisabled]}
                disabled={sending || chatInput.trim().length === 0}
                onPress={() => void handleSend()}
                accessibilityRole="button"
                accessibilityLabel="Send chat message"
              >
                {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.chatSendText}>Send</Text>}
              </Pressable>
            </View>
          )}
          {isLive && sessionStatus !== 'authenticated' && (
            <Text style={styles.chatClosedNote}>Sign in to join the chat.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Animated synthetic-stream surface — the honest stand-in for real HLS. */
function SimPlayer({ mode, delivery, deliveryNote, onLeave }: { mode: 'LIVE' | 'REPLAY'; delivery: string; deliveryNote: string; onLeave: () => void }) {
  // State-initialized (stable) Animated.Value — reading an Animated value in
  // JSX style is the RN idiom; useState keeps it OUT of the refs-during-render
  // hazard zone that useRef().current would create.
  const [pulse] = useState(() => new Animated.Value(0.4))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerSurface} accessibilityLabel={`Simulated ${mode.toLowerCase()} stream`}>
        <Animated.View style={[styles.playerPulse, { opacity: pulse }]} />
        <View style={styles.playerTag}>
          <Text style={styles.playerTagText}>
            {mode === 'LIVE' ? 'LIVE' : 'REPLAY'} · Simulated stream
          </Text>
        </View>
      </View>
      <Text style={styles.playerNote} numberOfLines={3}>
        {deliveryNote}
      </Text>
      <Text style={styles.playerDelivery}>
        Delivery: {delivery} — entitlement and session enforcement are fully active; a real
        video track appears once {delivery === 'CLOUDFLARE_STREAM' ? 'the stream URL resolves' : 'Cloudflare Stream credentials are configured'}.
      </Text>
      <Pressable style={styles.secondaryButton} onPress={onLeave} accessibilityRole="button" accessibilityLabel="Leave the broadcast">
        <Text style={styles.secondaryButtonText}>Leave</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  headerCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  badge: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
  badgeLive: { backgroundColor: theme.colors.danger },
  badgeReplay: { backgroundColor: theme.colors.primaryDark },
  badgeMuted: { backgroundColor: theme.colors.textMuted },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  viewerMeta: { color: theme.colors.textMuted, fontSize: 11 },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: 12, marginTop: theme.spacing.xs },
  accessMeta: { color: theme.colors.primaryDark, fontSize: 12, marginTop: theme.spacing.xs, fontWeight: '600' },
  playCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  playTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  playBody: { color: theme.colors.textMuted, fontSize: 12, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  secondaryButton: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 12 },
  buttonDisabled: { opacity: 0.55 },
  gateBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  gateTitle: { color: '#92400e', fontSize: 13, fontWeight: '700' },
  gateBody: { color: '#92400e', fontSize: 11, marginTop: theme.spacing.xs },
  playerCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  playerSurface: {
    height: 200,
    borderRadius: theme.radius.md,
    backgroundColor: '#0c0a09',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primary,
  },
  playerTag: { position: 'absolute', top: theme.spacing.sm, left: theme.spacing.sm, backgroundColor: 'rgba(28,25,23,0.7)', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
  playerTagText: { color: '#ffffff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  playerNote: { color: theme.colors.textMuted, fontSize: 11, marginTop: theme.spacing.md },
  playerDelivery: { color: theme.colors.textMuted, fontSize: 10, marginTop: theme.spacing.xs },
  deliveryNote: { color: theme.colors.textMuted, fontSize: 10, marginBottom: theme.spacing.md },
  chatCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  chatHeading: { color: theme.colors.text, fontSize: 13, fontWeight: '700', marginBottom: theme.spacing.xs },
  chatClosedNote: { color: theme.colors.textMuted, fontSize: 11, marginBottom: theme.spacing.sm },
  chatError: { color: theme.colors.danger, fontSize: 11, marginBottom: theme.spacing.sm },
  chatEmpty: { color: theme.colors.textMuted, fontSize: 11 },
  chatRow: { marginBottom: theme.spacing.sm },
  chatAuthor: { color: theme.colors.primaryDark, fontSize: 11, fontWeight: '700' },
  chatBody: { color: theme.colors.text, fontSize: 12, marginTop: 2 },
  chatInputRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  chatInput: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 12,
  },
  chatSend: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, justifyContent: 'center' },
  chatSendText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  retryButton: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  retryButtonText: { color: '#ffffff', fontWeight: '700' },
  errorTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.sm },
  mutedCenter: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' },
})
