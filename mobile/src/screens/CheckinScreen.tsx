/**
 * Check-in scanner — expo-camera barcode scanning + POST /api/v1/checkin/scan.
 *
 * What works where (see docs/NATIVE_MODULES.md for the full matrix):
 *  - expo-camera BARCODE SCANNING DOES work in Expo Go — this screen is usable
 *    there for online scanning (staff cookie session permitting).
 *  - RTMP/broadcast live publishing does NOT work in Expo Go and is not
 *    implemented here at all (development build + custom native module needed).
 *
 * Scan semantics (mirrors src/server/services/checkin.ts on the web app):
 *  - `payload` is the QR string "IEVX1.<ticketId>.<hmac>" or a plain ticket code.
 *  - `clientScanId` is an idempotency key: the server stores every scan by it
 *    and replays the ORIGINAL result if the same id is submitted twice (e.g. a
 *    retry after a flaky network). We therefore use
 *    `<device-uuid>:<timestamp>:<rand>` — the device-uuid part is persisted in
 *    AsyncStorage so scans are traceable per device, while the suffix keeps
 *    each submission unique.
 *  - Result banner: ADMITTED=green, DUPLICATE=amber, INVALID=red,
 *    CONFLICT=red (offline replay collided with an earlier admission).
 *
 * Offline loop — COMPLETE since round 30 (was a labelled stub):
 *  1. ONLINE scans hit /checkin/scan directly. NETWORK failures append to the
 *     capped AsyncStorage FIFO queue (500; oldest dropped and counted — the
 *     banner says so, never silent) with local dedup (same payload + event
 *     is not queued twice).
 *  2. Offline verification is ADVISORY: against the pre-downloaded roster
 *     (GET /checkin/roster — id/code/name/status only, staff-gated server-side)
 *     each queued scan gets a local verdict (roster match / not valid /
 *     not on roster / no roster). The server still decides at sync time.
 *  3. Sync triggers: NetInfo connectivity regain, AppState active, and the
 *     manual Sync now button. Failed batches stay queued verbatim (the
 *     triggers are discrete, so there is no busy retry loop to back off).
 *  4. Post-sync REVIEW: CONFLICT/DUPLICATE/INVALID outcomes from the last
 *     flush are surfaced in a review panel (the door lead acknowledges
 *     them) — the server preserves conflicts as results instead of
 *     discarding them, so nothing is lost, and nothing is hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiClientError, api, formatDateTime, type ScanResult } from '../api/client'
import {
  downloadRoster,
  enqueueOfflineScan,
  pendingVerdicts,
  readQueue,
  readRoster,
  readSyncReport,
  syncOfflineQueue,
  verifyOffline,
  type OfflineVerdict,
  type PendingVerdictRow,
  type RosterCache,
  type SyncReport,
} from '../lib/checkin-offline'
import { theme } from '../theme'
import type { CheckinScreenProps } from '../navigation'

const DEVICE_SCAN_ID_KEY = 'ieventplux.device.scanId'

/** Small random-hex helper (no uuid dependency needed for a scan id). */
function randomHex(len: number): string {
  let s = ''
  for (let i = 0; i < len; i += 1) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

/** RFC-4122-shaped, Math.random-based device id — uniqueness, not crypto, is the goal. */
function makeDeviceScanId(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randomHex(4)}-${randomHex(12)}}`
}

type Banner =
  | { kind: 'result'; scan: ScanResult }
  | { kind: 'queued'; payload: string; pending: number; droppedAtCap: number; verdict: OfflineVerdict }
  | { kind: 'duplicate'; payload: string; pending: number }
  | { kind: 'synced'; report: SyncReport }
  | { kind: 'roster'; count: number; savedAt: string }
  | { kind: 'error'; message: string }

const RESULT_COLORS: Record<ScanResult['result'], string> = {
  ADMITTED: theme.colors.success,
  DUPLICATE: theme.colors.warning,
  INVALID: theme.colors.danger,
  CONFLICT: theme.colors.danger,
}

const VERDICT_COLORS: Record<OfflineVerdict['verdict'], string> = {
  ROSTER_MATCH: theme.colors.success,
  ROSTER_NOT_VALID: theme.colors.danger,
  NOT_ON_ROSTER: theme.colors.danger,
  NO_ROSTER: theme.colors.warning,
}

export default function CheckinScreen({ route }: CheckinScreenProps) {
  const routeEventId = route.params?.eventId
  const [eventId, setEventId] = useState<string | null>(routeEventId ?? null)
  const [manualCode, setManualCode] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [deviceScanId, setDeviceScanId] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [roster, setRoster] = useState<RosterCache | null>(null)
  const [rosterBusy, setRosterBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [verdicts, setVerdicts] = useState<PendingVerdictRow[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)

  // Stable per-device id (persisted) — see header for why each scan adds a suffix.
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(DEVICE_SCAN_ID_KEY)
      .then((stored) => {
        if (cancelled) return
        const id = stored ?? makeDeviceScanId()
        setDeviceScanId(id)
        if (!stored) void AsyncStorage.setItem(DEVICE_SCAN_ID_KEY, id)
      })
      .catch(() => {
        if (!cancelled) setDeviceScanId(makeDeviceScanId())
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Last sync report (persisted) + queue length on mount.
  useEffect(() => {
    void readSyncReport().then(setReport)
    void readQueue().then((q) => setPendingCount(q.length))
  }, [])

  // Roster cache for the selected event (advisory offline verification).
  useEffect(() => {
    if (!eventId) {
      setRoster(null)
      return
    }
    let cancelled = false
    void readRoster(eventId).then((r) => {
      if (!cancelled) setRoster(r)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const refreshPending = useCallback(async () => {
    const queue = await readQueue()
    setPendingCount(queue.length)
    if (eventId) setVerdicts(await pendingVerdicts(roster, eventId))
  }, [eventId, roster])

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

  const handleSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const rep = await syncOfflineQueue()
      setReport(rep)
      setBanner({ kind: 'synced', report: rep })
      if (rep.review.length > 0) setReviewOpen(true)
      await refreshPending()
    } catch {
      setBanner({ kind: 'error', message: 'Sync failed — try again when back online.' })
    } finally {
      setSyncing(false)
    }
  }, [refreshPending, syncing])

  // Auto-sync triggers (round 30): connectivity regain + app active. The queue
  // is only flushed when there is something to flush — a discrete trigger, so
  // failed batches simply stay queued for the next trigger (no retry storm).
  const autoSyncRef = useRef(false)
  useEffect(() => {
    const tryAutoSync = () => {
      if (autoSyncRef.current) return
      void readQueue().then((q) => {
        if (q.length === 0) return
        autoSyncRef.current = true
        void handleSync().finally(() => {
          autoSyncRef.current = false
        })
      })
    }
    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) tryAutoSync()
    })
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void NetInfo.fetch().then((state) => {
          if (state.isConnected) tryAutoSync()
        })
      }
    })
    return () => {
      netUnsub()
      appSub.remove()
    }
  }, [handleSync])

  const handleRoster = useCallback(async () => {
    if (!eventId || rosterBusy) return
    setRosterBusy(true)
    try {
      const cache = await downloadRoster(eventId)
      setRoster(cache)
      setBanner({ kind: 'roster', count: cache.count, savedAt: cache.savedAt })
      setVerdicts(await pendingVerdicts(cache, eventId))
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Roster download failed.',
      })
    } finally {
      setRosterBusy(false)
    }
  }, [eventId, rosterBusy])

  // Throttle the scanner: expo-camera keeps firing while a code is in view.
  const scanLockRef = useRef(false)

  const handleScan = useCallback(
    async (payload: string) => {
      const trimmed = payload.trim()
      if (!trimmed || !eventId || !deviceScanId || scanLockRef.current) return
      scanLockRef.current = true
      setTimeout(() => {
        scanLockRef.current = false
      }, 1500)

      const clientScanId = `${deviceScanId}:${Date.now()}:${randomHex(4)}`
      try {
        const scan = await api.checkin.scan({ eventId, payload: trimmed, clientScanId, source: 'ONLINE' })
        setBanner({ kind: 'result', scan })
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'NETWORK') {
          const outcome = await enqueueOfflineScan({
            eventId,
            payload: trimmed,
            clientScanId,
            capturedOfflineAt: new Date().toISOString(),
          })
          setPendingCount(outcome.pending)
          if (outcome.duplicate) {
            setBanner({ kind: 'duplicate', payload: trimmed, pending: outcome.pending })
          } else {
            setBanner({
              kind: 'queued',
              payload: trimmed,
              pending: outcome.pending,
              droppedAtCap: outcome.droppedAtCap,
              verdict: verifyOffline(roster, trimmed),
            })
          }
          setVerdicts(await pendingVerdicts(roster, eventId))
        } else {
          setBanner({
            kind: 'error',
            message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Scan failed.',
          })
        }
      }
    },
    [eventId, deviceScanId, roster]
  )

  // ── No event selected yet: manual entry (organizer staff fetch the event id
  //    from their dashboard — the scan API is org-permission scoped server-side).
  if (!eventId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Check-in scanner</Text>
          <Text style={styles.setupBody}>
            Enter the event ID you are scanning for (find it in the organizer dashboard). The
            API requires check-in staff permissions for the event's organization.
          </Text>
          <TextInput
            style={styles.input}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Event ID (cuid)"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.button, manualCode.trim().length === 0 && styles.buttonDisabled]}
            disabled={manualCode.trim().length === 0}
            onPress={() => setEventId(manualCode.trim())}
            accessibilityRole="button"
            accessibilityLabel="Start scanning for this event"
          >
            <Text style={styles.buttonText}>Start scanning</Text>
          </Pressable>
          <Text style={styles.setupHint}>
            With the event selected, download the offline roster — scans queue locally when the
            venue network drops and sync with conflict preservation when it returns.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.cameraWrap}>
          {permission === null ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : permission.granted ? (
            // expo-camera barcode scanning works in Expo Go (RTMP publishing does
            // not — that requires a development build; see docs/NATIVE_MODULES.md).
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                void handleScan(data)
              }}
            />
          ) : (
            <View style={styles.center}>
              <Text style={styles.permissionTitle}>Camera access needed</Text>
              <Text style={styles.setupBody}>Grant camera access to scan ticket QR codes.</Text>
              <Pressable style={styles.button} onPress={() => void requestPermission()} accessibilityRole="button">
                <Text style={styles.buttonText}>Grant camera access</Text>
              </Pressable>
            </View>
          )}
        </View>

        <BannerView banner={banner} eventId={eventId} />

        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Manual code fallback (TKT-…)"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            style={styles.manualSubmit}
            disabled={manualCode.trim().length === 0}
            onPress={() => {
              void handleScan(manualCode.trim())
              setManualCode('')
            }}
            accessibilityRole="button"
            accessibilityLabel="Submit manual ticket code"
          >
            <Text style={styles.buttonText}>Submit</Text>
          </Pressable>
        </View>

        {/* Offline roster (advisory verification source). */}
        <View style={styles.rosterRow}>
          <View style={styles.rosterInfo}>
            <Text style={styles.rosterTitle}>
              {roster
                ? `Roster · ${roster.count} tickets · saved ${formatDateTime(roster.savedAt)}`
                : 'No roster downloaded yet'}
            </Text>
            <Text style={styles.rosterNote}>
              {roster
                ? 'Offline scans are verified against this roster (advisory) and still queue for the server verdict.'
                : 'Download before doors open to get local verdicts while offline.'}
            </Text>
          </View>
          <Pressable
            style={[styles.syncButton, rosterBusy && styles.buttonDisabled]}
            disabled={rosterBusy}
            onPress={() => void handleRoster()}
            accessibilityRole="button"
            accessibilityLabel={roster ? 'Refresh offline roster' : 'Download offline roster'}
          >
            {rosterBusy ? (
              <ActivityIndicator size="small" color={theme.colors.primaryDark} />
            ) : (
              <Text style={styles.syncButtonText}>{roster ? 'Refresh' : 'Download'}</Text>
            )}
          </Pressable>
        </View>

        {/* Review panel: last sync report + pending advisory verdicts. */}
        <Pressable
          style={styles.reviewToggle}
          onPress={() => setReviewOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={reviewOpen ? 'Hide sync review panel' : 'Show sync review panel'}
        >
          <Text style={styles.reviewToggleText}>
            {reviewOpen ? 'Hide' : 'Show'} review{report && report.review.length > 0 ? ` · ${report.review.length} to review` : ''}
            {verdicts.length > 0 ? ` · ${verdicts.length} queued` : ''}
          </Text>
        </Pressable>
        {reviewOpen && (
          <View style={styles.reviewPanel}>
            {report ? (
              <>
                <Text style={styles.reviewHeading}>
                  Last sync {formatDateTime(report.syncedAt)} — {report.synced} sent
                  {report.retained > 0 ? ` · ${report.retained} still queued` : ''}
                </Text>
                {report.review.length === 0 ? (
                  <Text style={styles.reviewEmpty}>No conflicts, duplicates or invalid codes.</Text>
                ) : (
                  report.review.map((r) => (
                    <View key={`${r.payload}-${r.syncedAt}`} style={styles.reviewItem}>
                      <Text style={[styles.reviewResult, { color: RESULT_COLORS[r.result] ?? theme.colors.textMuted }]}>
                        {r.result} · {r.payload}
                      </Text>
                      <Text style={styles.reviewDetail}>
                        {r.holder ? `${r.holder} — ` : ''}
                        {r.detail}
                      </Text>
                    </View>
                  ))
                )}
              </>
            ) : (
              <Text style={styles.reviewEmpty}>No sync has run yet.</Text>
            )}
            {verdicts.length > 0 && (
              <>
                <Text style={styles.reviewHeading}>Queued offline ({verdicts.length}) — advisory verdicts</Text>
                {verdicts.map((v) => (
                  <View key={v.payload + v.capturedOfflineAt} style={styles.reviewItem}>
                    <Text style={[styles.reviewResult, { color: VERDICT_COLORS[v.verdict] }]}>
                      {v.verdict.replace(/_/g, ' ').toLowerCase()} · {v.payload}
                    </Text>
                    <Text style={styles.reviewDetail}>
                      {v.holder ? `${v.holder} — ` : ''}
                      {v.note}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Event {eventId} · {pendingCount > 0 ? `${pendingCount} offline scan(s) queued` : 'queue empty'}
          {syncing ? ' · syncing…' : ''}
        </Text>
        <Pressable
          style={[styles.syncButton, (syncing || pendingCount === 0) && styles.buttonDisabled]}
          disabled={syncing || pendingCount === 0}
          onPress={() => void handleSync()}
          accessibilityRole="button"
          accessibilityLabel="Sync offline scans now"
        >
          {syncing ? (
            <ActivityIndicator size="small" color={theme.colors.primaryDark} />
          ) : (
            <Text style={styles.syncButtonText}>Sync now</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function BannerView({ banner, eventId }: { banner: Banner | null; eventId: string }) {
  if (!banner) {
    return (
      <View style={styles.bannerNeutral}>
        <Text style={styles.bannerNeutralText}>
          Scanning for event {eventId}. Point the camera at a ticket QR, or type the code below.
        </Text>
      </View>
    )
  }
  if (banner.kind === 'result') {
    const color = RESULT_COLORS[banner.scan.result] ?? theme.colors.textMuted
    return (
      <View style={[styles.banner, { backgroundColor: color }]}>
        <Text style={styles.bannerTitle}>{banner.scan.result}</Text>
        {banner.scan.ticket ? (
          <Text style={styles.bannerBody}>
            {banner.scan.ticket.holderName} · {banner.scan.ticket.ticketType} · {banner.scan.ticket.code}
          </Text>
        ) : null}
        <Text style={styles.bannerBody}>{banner.scan.detail}</Text>
      </View>
    )
  }
  if (banner.kind === 'queued') {
    const color = VERDICT_COLORS[banner.verdict.verdict]
    return (
      <View style={[styles.banner, { backgroundColor: color }]}>
        <Text style={styles.bannerTitle}>
          Queued offline ({banner.pending} pending) — {banner.verdict.verdict.replace(/_/g, ' ').toLowerCase()}
        </Text>
        <Text style={styles.bannerBody}>
          {banner.verdict.holder ? `${banner.verdict.holder} · ` : ''}
          {banner.payload} — {banner.verdict.note}
        </Text>
        {banner.droppedAtCap > 0 && (
          <Text style={styles.bannerBody}>Queue cap reached: {banner.droppedAtCap} oldest scan(s) dropped.</Text>
        )}
      </View>
    )
  }
  if (banner.kind === 'duplicate') {
    return (
      <View style={[styles.banner, { backgroundColor: theme.colors.warning }]}>
        <Text style={styles.bannerTitle}>Already queued ({banner.pending} pending)</Text>
        <Text style={styles.bannerBody}>
          {banner.payload} — this code is already in the offline queue; it will sync once.
        </Text>
      </View>
    )
  }
  if (banner.kind === 'synced') {
    return (
      <View style={[styles.banner, { backgroundColor: theme.colors.success }]}>
        <Text style={styles.bannerTitle}>
          Synced {banner.report.synced} offline scan(s)
          {banner.report.retained > 0 ? ` · ${banner.report.retained} still queued` : ''}
        </Text>
        {banner.report.review.length > 0 && (
          <Text style={styles.bannerBody}>
            {banner.report.review.length} result(s) need review — open the review panel below.
          </Text>
        )}
      </View>
    )
  }
  if (banner.kind === 'roster') {
    return (
      <View style={[styles.banner, { backgroundColor: theme.colors.primaryDark }]}>
        <Text style={styles.bannerTitle}>Roster saved · {banner.count} tickets</Text>
        <Text style={styles.bannerBody}>
          Saved {formatDateTime(banner.savedAt)} — offline scans now get local advisory verdicts.
        </Text>
      </View>
    )
  }
  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.danger }]}>
      <Text style={styles.bannerTitle}>Scan error</Text>
      <Text style={styles.bannerBody}>{banner.message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scrollContent: { paddingBottom: theme.spacing.md },
  cameraWrap: { height: 320, backgroundColor: '#0c0a09' },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  permissionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.sm },
  setupCard: { flex: 1, padding: theme.spacing.xl, justifyContent: 'center' },
  setupTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '700', marginBottom: theme.spacing.sm },
  setupBody: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.lg },
  setupHint: { color: theme.colors.textMuted, fontSize: 11, marginTop: theme.spacing.lg },
  input: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  banner: { padding: theme.spacing.lg, minHeight: 64 },
  bannerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  bannerBody: { color: '#ffffff', fontSize: 12, marginTop: theme.spacing.xs, opacity: 0.95 },
  bannerNeutral: {
    padding: theme.spacing.md,
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#a7f3d0',
  },
  bannerNeutralText: { color: '#065f46', fontSize: 12 },
  manualRow: { flexDirection: 'row', padding: theme.spacing.md, gap: theme.spacing.sm },
  manualInput: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
  },
  manualSubmit: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, justifyContent: 'center' },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rosterInfo: { flex: 1 },
  rosterTitle: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  rosterNote: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  reviewToggle: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  reviewToggleText: { color: theme.colors.primaryDark, fontSize: 12, fontWeight: '700' },
  reviewPanel: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  reviewHeading: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginBottom: theme.spacing.sm },
  reviewEmpty: { color: theme.colors.textMuted, fontSize: 11 },
  reviewItem: { marginBottom: theme.spacing.sm },
  reviewResult: { fontSize: 12, fontWeight: '700' },
  reviewDetail: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: { color: theme.colors.textMuted, fontSize: 11, flex: 1 },
  syncButton: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    minWidth: 84,
    alignItems: 'center',
  },
  syncButtonText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 12 },
})
