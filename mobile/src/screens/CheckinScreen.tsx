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
import {PremiumBackdrop,TileGlyph,mobileDesign} from '../ui/PremiumUI'
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
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randomHex(4)}-${randomHex(12)}`
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
          <View style={styles.setupHero}><PremiumBackdrop mode="midnight"/>
            <TileGlyph kind="scanner" size={70}/>
            <Text style={styles.setupEyebrow}>✦  iEVENTPLUX EVENT ACCESS</Text>
            <Text style={styles.setupTitle}>Check-in, made seamless.</Text>
            <Text style={styles.setupHeroText}>Verify entry, welcome attendees and keep the event moving.</Text>
          </View>
          <Text style={styles.setupSectionTitle}>Select your event</Text>
          <Text style={styles.setupBody}>Enter the event ID from the organizer dashboard. The server checks your staff permissions before accepting scans.</Text>
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
        <View style={styles.scanHeading}><View style={styles.scanHeadingText}><Text style={styles.scanEyebrow}>✦  STAFF CHECK-IN</Text>
          <Text style={styles.scanTitle}>Welcome your guests.</Text><Text style={styles.scanSubtitle}>Scan a ticket QR or enter its code securely.</Text></View>
          <TileGlyph kind="scanner" size={48}/></View>
        <View style={styles.cameraWrap}>
          {permission === null ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : permission.granted ? (
            // expo-camera barcode scanning works in Expo Go (RTMP publishing does
            // not — that requires a development build; see docs/NATIVE_MODULES.md).
            <View style={styles.cameraSurface}>
              <CameraView style={styles.camera} barcodeScannerSettings={{barcodeTypes:['qr']}}
                onBarcodeScanned={({data})=>{void handleScan(data)}}/>
              <View style={styles.scanOverlay} pointerEvents="none"><View style={styles.reticle}/></View>
            </View>
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

        <View style={styles.manualHeading}><Text style={styles.manualHeadingTitle}>Enter code manually</Text><Text style={styles.manualHeadingHint}>When a camera scan isn't possible</Text></View>
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

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:mobileDesign.canvas},
  scrollContent:{paddingTop:15,paddingHorizontal:18,paddingBottom:25,gap:14},
  setupCard:{flex:1,padding:19,justifyContent:'center',gap:16},
  setupHero:{backgroundColor:mobileDesign.forestDeep,borderRadius:28,padding:24,minHeight:265,justifyContent:'center',gap:11,overflow:'hidden'},
  setupEyebrow:{color:'#caf7e5',fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:8},
  setupTitle:{fontSize:28,fontWeight:'900',color:'#fff',letterSpacing:-.8,lineHeight:35},
  setupHeroText:{fontSize:13,lineHeight:21,color:'#e3f6ed'},
  setupSectionTitle:{fontSize:19,color:mobileDesign.ink,fontWeight:'900',marginTop:7},
  setupBody:{color:mobileDesign.inkMuted,fontSize:13,lineHeight:21},
  setupHint:{color:mobileDesign.inkMuted,fontSize:11,lineHeight:20,backgroundColor:mobileDesign.mintSoft,padding:14,borderRadius:15},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:16,padding:14,minHeight:53,color:mobileDesign.ink,fontSize:14},
  button:{backgroundColor:mobileDesign.emerald,borderRadius:15,minHeight:53,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},
  buttonDisabled:{opacity:.5},buttonText:{color:'#fff',fontSize:13,fontWeight:'900'},
  scanHeading:{flexDirection:'row',alignItems:'center',gap:14,justifyContent:'space-between'},scanHeadingText:{flex:1},
  scanEyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:mobileDesign.emerald},
  scanTitle:{fontSize:23,fontWeight:'900',color:mobileDesign.ink,letterSpacing:-.6,marginTop:5},
  scanSubtitle:{fontSize:12,color:mobileDesign.inkMuted,marginTop:6,lineHeight:19},
  cameraWrap:{height:320,backgroundColor:'#0a2830',borderRadius:24,overflow:'hidden',position:'relative',shadowColor:mobileDesign.shadow,shadowOpacity:.14,shadowRadius:17,shadowOffset:{width:0,height:9},elevation:4},
  cameraSurface:{flex:1,position:'relative'},camera:{flex:1},
  scanOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,justifyContent:'center',alignItems:'center'},
  reticle:{width:'62%',aspectRatio:1,borderWidth:2,borderColor:'#d7f9e2',borderRadius:22,backgroundColor:'transparent'},
  center:{flex:1,alignItems:'center',justifyContent:'center',padding:22},
  permissionTitle:{color:'#fff',fontSize:18,fontWeight:'900',marginBottom:10},
  banner:{padding:16,minHeight:69,borderRadius:18,gap:5},bannerTitle:{color:'#fff',fontSize:16,fontWeight:'900'},
  bannerBody:{color:'#fff',fontSize:12,lineHeight:19},
  bannerNeutral:{padding:14,backgroundColor:mobileDesign.mintSoft,borderRadius:16,borderWidth:1,borderColor:'#d2ebe0'},
  bannerNeutralText:{color:mobileDesign.emerald,fontSize:12,fontWeight:'700',lineHeight:19},
  manualHeading:{marginTop:7},manualHeadingTitle:{fontSize:16,color:mobileDesign.ink,fontWeight:'900'},
  manualHeadingHint:{fontSize:11,color:mobileDesign.inkMuted,marginTop:4},
  manualRow:{flexDirection:'row',gap:9},manualInput:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:15,paddingHorizontal:12,minHeight:51,color:mobileDesign.ink,fontSize:13},
  manualSubmit:{backgroundColor:mobileDesign.emerald,borderRadius:15,paddingHorizontal:16,justifyContent:'center',minHeight:51},
  rosterRow:{flexDirection:'row',alignItems:'center',gap:12,padding:15,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff',borderRadius:20},
  rosterInfo:{flex:1},rosterTitle:{color:mobileDesign.ink,fontSize:12,fontWeight:'900',lineHeight:18},
  rosterNote:{color:mobileDesign.inkMuted,fontSize:11,lineHeight:18,marginTop:6},
  reviewToggle:{paddingVertical:13,paddingHorizontal:14,borderRadius:15,backgroundColor:mobileDesign.mintSoft,alignItems:'center'},
  reviewToggleText:{color:mobileDesign.emerald,fontSize:12,fontWeight:'900',textAlign:'center'},
  reviewPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:20,padding:16,gap:9},
  reviewHeading:{color:mobileDesign.ink,fontSize:13,fontWeight:'900',marginBottom:6},reviewEmpty:{color:mobileDesign.inkMuted,fontSize:11},
  reviewItem:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:mobileDesign.border},reviewResult:{fontSize:12,fontWeight:'900'},
  reviewDetail:{color:mobileDesign.inkMuted,fontSize:11,lineHeight:18,marginTop:4},
  footer:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:15,paddingVertical:13,borderTopWidth:1,borderTopColor:mobileDesign.border,backgroundColor:'#fff',gap:9},
  footerText:{color:mobileDesign.inkMuted,fontSize:11,flex:1,lineHeight:18},
  syncButton:{backgroundColor:mobileDesign.mintSoft,borderWidth:1,borderColor:'#bee2d2',borderRadius:14,paddingHorizontal:13,minHeight:45,minWidth:85,alignItems:'center',justifyContent:'center'},
  syncButtonText:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},
})
