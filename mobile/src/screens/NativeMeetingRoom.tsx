/**
 * LiveKit native SFU room for custom Expo development/release builds.
 * This module is loaded only after an explicit Join gesture and must not be
 * imported on startup in Expo Go: Expo Go lacks the WebRTC native modules.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useLocalParticipant,
  registerGlobals, useParticipants, useRoomContext, useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native'
import { Track } from 'livekit-client'
import { api, ApiClientError } from '../api/client'
import type { NativeMeetingScreenProps } from '../navigation'
import { theme } from '../theme'

registerGlobals()

type DeviceKind = 'camera' | 'microphone'
const VISIBLE_TILES = 8

function RoomControls({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext()
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant()
  const [working, setWorking] = useState<DeviceKind | null>(null)
  const [error, setError] = useState('')

  const toggle = async (kind: DeviceKind) => {
    if (working) return
    setWorking(kind)
    setError('')
    try {
      if (kind === 'microphone') {
        await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
      } else {
        await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)
      }
    } catch {
      setError(kind === 'camera'
        ? 'Camera could not start. Allow camera permission in app settings and retry.'
        : 'Microphone could not start. Allow microphone permission in app settings and retry.')
    } finally {
      setWorking(null)
    }
  }
  return <View style={styles.controls}>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.buttonRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={isMicrophoneEnabled ? 'Mute microphone' : 'Turn on microphone'}
        disabled={working !== null} onPress={() => void toggle('microphone')}
        style={[styles.controlButton, !isMicrophoneEnabled && styles.controlOff]}>
        {working === 'microphone' ? <ActivityIndicator color={theme.colors.primary} />
          : <Text style={styles.controlText}>{isMicrophoneEnabled ? 'Mute mic' : 'Unmute mic'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        disabled={working !== null} onPress={() => void toggle('camera')}
        style={[styles.controlButton, !isCameraEnabled && styles.controlOff]}>
        {working === 'camera' ? <ActivityIndicator color={theme.colors.primary} />
          : <Text style={styles.controlText}>{isCameraEnabled ? 'Camera off' : 'Camera on'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Leave the meeting"
        onPress={onLeave} style={[styles.controlButton, styles.leave]}>
        <Text style={styles.leaveText}>Leave</Text>
      </Pressable>
    </View>
  </View>
}

function ParticipantTiles() {
  const participants = useParticipants()
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(tracks.length / VISIBLE_TILES))
  const current = Math.min(page, pages - 1)
  const selected = useMemo(() =>
    tracks.slice(current * VISIBLE_TILES, current * VISIBLE_TILES + VISIBLE_TILES),
  [tracks, current])
  const renderTile = ({ item }: { item: TrackReferenceOrPlaceholder }) => (
    <View style={styles.tile}>
      {isTrackReference(item) ? <VideoTrack style={styles.video} trackRef={item} objectFit="contain" /> :
        <View style={[styles.video, styles.placeholder]}>
          <Text style={styles.placeholderName}>Camera off</Text>
        </View>}
      <Text numberOfLines={1} style={styles.tileCaption}>
        {item.participant.name || 'Participant'}
        {item.source === Track.Source.ScreenShare ? ' · screen' : ''}
      </Text>
    </View>
  )
  return <View style={styles.grow}>
    <Text style={styles.peopleCount}>{participants.length} in this meeting · {tracks.length} video tiles</Text>
    <FlatList data={selected} renderItem={renderTile}
      keyExtractor={(item) => item.participant.identity + ':' + item.source}
      numColumns={2} columnWrapperStyle={styles.tileRow}
      contentContainerStyle={styles.tiles} style={styles.grow}
      ListEmptyComponent={<Text style={styles.empty}>Waiting for video streams. Audio-only participants can still be heard.</Text>} />
    {pages > 1 && <View style={styles.pagination}>
      <Pressable accessibilityRole="button" disabled={current === 0}
        onPress={() => setPage((value) => Math.max(0, value - 1))} style={styles.pageButton}>
        <Text style={styles.pageText}>Previous</Text>
      </Pressable>
      <Text style={styles.pageText}>Page {current + 1} / {pages}</Text>
      <Pressable accessibilityRole="button" disabled={current >= pages - 1}
        onPress={() => setPage((value) => Math.min(pages - 1, value + 1))} style={styles.pageButton}>
        <Text style={styles.pageText}>Next</Text>
      </Pressable>
    </View>}
  </View>
}

export default function NativeMeetingRoom({ navigation, route }: NativeMeetingScreenProps) {
  const { meetingId, serverUrl, token, microphone, camera } = route.params
  const [audioReady, setAudioReady] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leave = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    navigation.goBack()
  }, [leaving, navigation])

  useEffect(() => {
    let active = true
    void AudioSession.startAudioSession().then(() => {
      if (active) setAudioReady(true)
      else void AudioSession.stopAudioSession()
    }).catch(() => {
      if (active) setError('Unable to start phone audio routing. Check audio permissions and try again.')
    })
    return () => {
      active = false
      void AudioSession.stopAudioSession()
    }
  }, [])

  useEffect(() => {
    // Server side also revokes admission and removes participants from LiveKit.
    // Keep a local guard so a revoked user is not left on an inert call screen.
    let active = true
    const verify = async () => {
      try {
        const detail = await api.meetings.detail(meetingId)
        if (!active) return
        if (detail.meeting.status !== 'LIVE' || !detail.access.canJoin) {
          setError('Your meeting access has ended.')
          leave()
        }
      } catch (reason) {
        if (!active) return
        if (reason instanceof ApiClientError && [401, 403, 404, 503].includes(reason.status)) {
          setError('Meeting admission is no longer valid.')
          leave()
        }
      }
    }
    const interval = setInterval(() => { void verify() }, 15_000)
    return () => { active = false; clearInterval(interval) }
  }, [meetingId, leave])

  return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
    <View style={styles.header}>
      <View style={styles.grow}>
        <Text style={styles.heading}>Event group meeting</Text>
        <Text style={styles.subheading}>{connected ? 'Connected · secure audio/video' : 'Connecting to secure room…'}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={leave} style={styles.headerLeave}>
        <Text style={styles.leaveText}>Leave</Text>
      </Pressable>
    </View>
    {error ? <View style={styles.errorCard}>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable onPress={leave} accessibilityRole="button" style={styles.errorClose}>
        <Text style={styles.pageText}>Return to event</Text>
      </Pressable>
    </View> : null}
    {audioReady ? <LiveKitRoom
      token={token} serverUrl={serverUrl} connect={true}
      audio={microphone} video={camera}
      options={{ adaptiveStream: true, dynacast: true }}
      onConnected={() => setConnected(true)}
      onDisconnected={leave}
      onError={() => setError('The media connection could not start. Check connectivity or use the system browser option.')}
      onMediaDeviceFailure={() => setError('A camera or microphone is unavailable. Check device permissions or turn it off and rejoin.')}
    >
      <ParticipantTiles />
      <RoomControls onLeave={leave} />
    </LiveKitRoom> :
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Preparing native audio and media…</Text>
      </View>}
    <Text style={styles.footer}>
      Secure LiveKit group call · camera and microphone can be turned off ·
      screen sharing from this phone is not yet supported.
    </Text>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor:'#091a16' },
  header: { padding:16, flexDirection:'row', alignItems:'center', borderBottomWidth:1, borderColor:'#214237', gap:12 },
  grow: { flex:1 },
  heading: { color:'#ffffff', fontSize:18, fontWeight:'800' },
  subheading: { color:'#a9d8c6', fontSize:12, marginTop:4 },
  headerLeave: { backgroundColor:'#7f1d1d', paddingHorizontal:14, paddingVertical:10, borderRadius:12 },
  leaveText: { color:'#ffffff', fontSize:13, fontWeight:'800' },
  peopleCount: { color:'#c9e7da', fontSize:12, padding:12 },
  tiles: { padding:8, paddingBottom:16 },
  tileRow: { gap:8, marginBottom:8 },
  tile: { flex:1, minWidth:0, borderRadius:12, backgroundColor:'#142e27', overflow:'hidden' },
  video: { width:'100%', aspectRatio: 4/3 },
  placeholder: { backgroundColor:'#17382c', justifyContent:'center', alignItems:'center' },
  placeholderName: { color:'#b7d8c9', fontSize:12 },
  tileCaption: { color:'#ffffff', padding:7, fontWeight:'600', fontSize:11 },
  empty: { color:'#b9d2c7', padding:16, textAlign:'center' },
  pagination: { flexDirection:'row', alignItems:'center', justifyContent:'space-around', padding:8 },
  pageButton: { borderRadius:9, borderWidth:1, borderColor:'#3f6b5c', padding:10 },
  pageText: { color:'#dcf5ea', fontSize:12, fontWeight:'700' },
  controls: { padding:12, borderTopWidth:1, borderColor:'#2f574a', gap:8 },
  buttonRow: { flexDirection:'row', gap:8 },
  controlButton: { flex:1, minHeight:48, borderRadius:12, backgroundColor:'#e2f3ea', alignItems:'center', justifyContent:'center' },
  controlText: { color:'#075744', fontSize:12, fontWeight:'800' },
  controlOff: { backgroundColor:'#b9ccbf' },
  leave: { backgroundColor:'#b91c1c' },
  errorCard: { padding:12, backgroundColor:'#451a19', gap:8 },
  error: { color:'#fed7d7', fontSize:12, lineHeight:19 },
  errorClose: { borderRadius:8, borderColor:'#fca5a5', borderWidth:1, padding:8, alignSelf:'flex-start' },
  loading: { flex:1, justifyContent:'center', alignItems:'center', gap:15 },
  loadingText: { color:'#d1fae5', fontSize:13 },
  footer: { padding:12, textAlign:'center', color:'#bad5c9', fontSize:10, lineHeight:15 },
})
