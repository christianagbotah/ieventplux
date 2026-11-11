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
 * Offline queue — STUB (documented TODO, deliberately minimal):
 *  1. Scans that fail with a NETWORK error append to an AsyncStorage FIFO queue.
 *  2. "Sync now" (and, in the full design, an AppState-active listener) flushes
 *     via POST /api/v1/checkin/sync with source OFFLINE_SYNC so the server
 *     preserves conflicts as CONFLICT results instead of discarding them.
 *  3. TODO(offline): surface CONFLICT results in the scanner UI + organizer
 *     dashboard review queue; pre-download GET /checkin/roster for offline
 *     verification; cap queue size; exponential backoff. Verify against your
 *     event-ops SOP before trusting it at a door.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiClientError, api, type ScanResult } from '../api/client'
import { theme } from '../theme'
import type { CheckinScreenProps } from '../navigation'

const DEVICE_SCAN_ID_KEY = 'ieventplux.device.scanId'
const OFFLINE_QUEUE_KEY = 'ieventplux.checkin.offlineQueue'

interface QueuedScan {
  eventId: string
  payload: string
  clientScanId: string
  capturedOfflineAt: string
}

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

// ───────────────────────────────── offline queue (STUB — see header TODOs) ──

async function readQueue(): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : []
  } catch {
    return []
  }
}

async function writeQueue(items: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items))
}

/** Returns the new queue length. */
async function enqueueOfflineScan(item: QueuedScan): Promise<number> {
  const queue = await readQueue()
  // TODO(offline): cap the queue (e.g. 500) and drop oldest with an audit note.
  const next = [...queue, item]
  await writeQueue(next)
  return next.length
}

/** Flush via /checkin/sync (source OFFLINE_SYNC → conflicts preserved). */
async function syncOfflineQueue(): Promise<number> {
  const queue = await readQueue()
  if (queue.length === 0) return 0
  let synced = 0
  // The sync endpoint is per-eventId; group the queue before flushing.
  const byEvent = new Map<string, QueuedScan[]>()
  for (const item of queue) {
    const list = byEvent.get(item.eventId) ?? []
    list.push(item)
    byEvent.set(item.eventId, list)
  }
  const remaining: QueuedScan[] = []
  for (const [eventId, scans] of byEvent) {
    try {
      const res = await api.checkin.sync({
        eventId,
        scans: scans.map((s) => ({
          payload: s.payload,
          clientScanId: s.clientScanId,
          capturedOfflineAt: s.capturedOfflineAt,
        })),
      })
      synced += res.synced
      // TODO(offline): res.results may contain CONFLICT entries that must be
      // surfaced for review — currently only counted, not displayed. See header.
    } catch {
      // Event batch failed (offline again / permission lost) — keep for retry.
      remaining.push(...scans)
    }
  }
  await writeQueue(remaining)
  return synced
}

// ─────────────────────────────────────────────────────────────────── screen ──

type Banner =
  | { kind: 'result'; scan: ScanResult }
  | { kind: 'queued'; payload: string; pending: number }
  | { kind: 'synced'; count: number }
  | { kind: 'error'; message: string }

const RESULT_COLORS: Record<ScanResult['result'], string> = {
  ADMITTED: theme.colors.success,
  DUPLICATE: theme.colors.warning,
  INVALID: theme.colors.danger,
  CONFLICT: theme.colors.danger,
}

export default function CheckinScreen({ route }: CheckinScreenProps) {
  const routeEventId = route.params?.eventId
  const [eventId, setEventId] = useState<string | null>(routeEventId ?? null)
  const [manualCode, setManualCode] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [deviceScanId, setDeviceScanId] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()

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

  const refreshPending = useCallback(async () => {
    const queue = await readQueue()
    setPendingCount(queue.length)
  }, [])

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

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
          const pending = await enqueueOfflineScan({
            eventId,
            payload: trimmed,
            clientScanId,
            capturedOfflineAt: new Date().toISOString(),
          })
          setPendingCount(pending)
          setBanner({ kind: 'queued', payload: trimmed, pending })
        } else {
          setBanner({
            kind: 'error',
            message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Scan failed.',
          })
        }
      }
    },
    [eventId, deviceScanId]
  )

  const handleSync = useCallback(async () => {
    try {
      const count = await syncOfflineQueue()
      await refreshPending()
      setBanner({ kind: 'synced', count })
    } catch {
      setBanner({ kind: 'error', message: 'Sync failed — try again when back online.' })
    }
  }, [refreshPending])

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
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Event {eventId} · {pendingCount > 0 ? `${pendingCount} offline scan(s) queued` : 'queue empty'}
        </Text>
        <Pressable style={styles.syncButton} onPress={() => void handleSync()} accessibilityRole="button" accessibilityLabel="Sync offline scans now">
          <Text style={styles.syncButtonText}>Sync now</Text>
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
    return (
      <View style={[styles.banner, { backgroundColor: theme.colors.warning }]}>
        <Text style={styles.bannerTitle}>Queued offline ({banner.pending} pending)</Text>
        <Text style={styles.bannerBody}>
          {banner.payload} — will sync with conflict preservation when back online.
        </Text>
      </View>
    )
  }
  if (banner.kind === 'synced') {
    return (
      <View style={[styles.banner, { backgroundColor: theme.colors.success }]}>
        <Text style={styles.bannerTitle}>Synced {banner.count} offline scan(s)</Text>
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
  cameraWrap: { flex: 1, backgroundColor: '#0c0a09' },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  permissionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.sm },
  setupCard: { flex: 1, padding: theme.spacing.xl, justifyContent: 'center' },
  setupTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '700', marginBottom: theme.spacing.sm },
  setupBody: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.lg },
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: { color: theme.colors.textMuted, fontSize: 11, flex: 1 },
  syncButton: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  syncButtonText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 12 },
})
