/**
 * LiveKit native SFU room for custom Expo development/release builds.
 * This module is loaded only after an explicit Join gesture and must not be
 * imported on startup in Expo Go: Expo Go lacks the WebRTC native modules.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native'
import {useCameraPermissions,useMicrophonePermissions} from 'expo-camera'
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
import {PremiumBackdrop,mobileDesign} from '../ui/PremiumUI'

registerGlobals()

type DeviceKind = 'camera' | 'microphone'
const VISIBLE_TILES = 8

function RoomControls({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext()
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant()
  const [working, setWorking] = useState<DeviceKind | null>(null)
  const [error, setError] = useState('')
  const [cameraAccess,requestCamera] = useCameraPermissions()
  const [micAccess,requestMicrophone] = useMicrophonePermissions()

  const toggle = async (kind: DeviceKind) => {
    if (working) return
    setWorking(kind)
    setError('')
    try {
      if (kind === 'microphone') {
        const turnOn=!room.localParticipant.isMicrophoneEnabled
        if(turnOn&&!micAccess?.granted){
          const permission=await requestMicrophone()
          if(!permission.granted)throw new Error('Microphone permission denied. Enable it in app settings to speak.')
        }
        await room.localParticipant.setMicrophoneEnabled(turnOn)
      } else {
        const turnOn=!room.localParticipant.isCameraEnabled
        if(turnOn&&!cameraAccess?.granted){
          const permission=await requestCamera()
          if(!permission.granted)throw new Error('Camera permission denied. Enable it in app settings to show video.')
        }
        await room.localParticipant.setCameraEnabled(turnOn)
      }
    } catch(reason) {
      setError(reason instanceof Error?reason.message:kind==='camera'
        ? 'Camera could not start. Allow camera permission in app settings and retry.'
        : 'Microphone could not start. Allow microphone permission in app settings and retry.')
    } finally {
      setWorking(null)
    }
  }
  return <View style={styles.controls}>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.buttonRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={isMicrophoneEnabled?'Mute microphone':'Turn on microphone'}
        disabled={working!==null} onPress={()=>void toggle('microphone')}
        style={[styles.controlButton,!isMicrophoneEnabled&&styles.controlOff]}>
        {working==='microphone'?<ActivityIndicator color={mobileDesign.emerald}/>:<>
          <Text style={styles.controlIcon}>{isMicrophoneEnabled?'◉':'⊘'}</Text>
          <Text style={styles.controlText}>{isMicrophoneEnabled?'Mute':'Unmute'}</Text>
        </>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={isCameraEnabled?'Turn off camera':'Turn on camera'}
        disabled={working!==null} onPress={()=>void toggle('camera')}
        style={[styles.controlButton,!isCameraEnabled&&styles.controlOff]}>
        {working==='camera'?<ActivityIndicator color={mobileDesign.emerald}/>:<>
          <Text style={styles.controlIcon}>{isCameraEnabled?'▣':'⊘'}</Text>
          <Text style={styles.controlText}>{isCameraEnabled?'Video off':'Video on'}</Text>
        </>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Leave the meeting"
        onPress={onLeave} style={[styles.controlButton,styles.leave]}>
        <Text style={styles.leaveIcon}>⌁</Text><Text style={styles.leaveText}>Leave</Text>
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
    <View style={styles.participantsHeader}><Text style={styles.peopleCount}>{participants.length.toLocaleString('en-US')} participants</Text>
      <Text style={styles.tilesCount}>{tracks.length} available video tracks</Text></View>
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
      <PremiumBackdrop mode="midnight"/>
      <View style={styles.headerMark}><Text style={styles.headerMarkText}>✦</Text></View>
      <View style={styles.grow}>
        <Text style={styles.heading}>iEventPlux Meeting</Text>
        <Text style={styles.subheading}>{connected?'●  Connected securely':'◌  Connecting to secure room…'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Leave meeting" onPress={leave} style={styles.headerLeave}>
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
    <Text style={styles.footer}>SECURE LIVEKIT CALL  ·  MICROPHONE & CAMERA CONTROLS  ·  PHONE SCREEN SHARING NOT YET AVAILABLE</Text>
  </SafeAreaView>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#091b24'},
  header:{padding:15,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderColor:'#ffffff22',gap:10,backgroundColor:mobileDesign.forestDeep,overflow:'hidden'},
  headerMark:{width:41,height:41,backgroundColor:'#ffffff25',borderRadius:14,alignItems:'center',justifyContent:'center'},
  headerMarkText:{color:'#c7f8df',fontSize:22},grow:{flex:1},
  heading:{color:'#fff',fontSize:16,fontWeight:'900',letterSpacing:-.2},subheading:{color:'#c3e4d9',fontSize:11,marginTop:5,fontWeight:'700'},
  headerLeave:{backgroundColor:'#a63534',paddingHorizontal:15,minHeight:43,justifyContent:'center',borderRadius:14},
  leaveText:{color:'#fff',fontSize:12,fontWeight:'900'},
  participantsHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:9,paddingHorizontal:15,paddingTop:15,paddingBottom:11},
  peopleCount:{color:'#fff',fontSize:14,fontWeight:'900'},tilesCount:{color:'#b5d7ca',fontSize:11,fontWeight:'700'},
  tiles:{paddingHorizontal:8,paddingBottom:16},tileRow:{gap:8,marginBottom:8},
  tile:{flex:1,minWidth:0,borderRadius:18,backgroundColor:'#142d36',overflow:'hidden',borderColor:'#ffffff20',borderWidth:1},
  video:{width:'100%',aspectRatio:4/3},placeholder:{backgroundColor:'#14333d',justifyContent:'center',alignItems:'center'},
  placeholderName:{color:'#b7d9d1',fontSize:12,fontWeight:'700'},tileCaption:{color:'#fff',padding:10,fontWeight:'800',fontSize:11},
  empty:{color:'#c9e4dc',padding:24,textAlign:'center',fontSize:13,lineHeight:20},
  pagination:{flexDirection:'row',alignItems:'center',justifyContent:'space-around',padding:10,gap:8},
  pageButton:{borderRadius:13,borderWidth:1,borderColor:'#507a6d',padding:12,minHeight:44,justifyContent:'center'},
  pageText:{color:'#e1f7ea',fontSize:12,fontWeight:'800'},
  controls:{paddingHorizontal:11,paddingVertical:13,borderTopWidth:1,borderColor:'#ffffff2a',backgroundColor:'#0d2732',gap:8},
  buttonRow:{flexDirection:'row',gap:10},
  controlButton:{flex:1,minHeight:66,borderRadius:18,backgroundColor:'#e4f5ea',alignItems:'center',justifyContent:'center',gap:4,padding:7},
  controlText:{color:'#0e5b4d',fontSize:11,fontWeight:'900'},controlIcon:{color:'#0e5b4d',fontSize:21,fontWeight:'900'},
  controlOff:{backgroundColor:'#cad5d0'},leave:{backgroundColor:'#b53d3d'},leaveIcon:{color:'#fff',fontSize:22,fontWeight:'900'},
  errorCard:{padding:14,backgroundColor:'#562926',gap:10},error:{color:'#ffe1dd',fontSize:12,lineHeight:20},
  errorClose:{borderRadius:13,borderColor:'#e9a29e',borderWidth:1,padding:12,alignSelf:'flex-start'},
  loading:{flex:1,justifyContent:'center',alignItems:'center',gap:15},loadingText:{color:'#d1f5e9',fontSize:13,fontWeight:'700'},
  footer:{paddingHorizontal:14,paddingVertical:11,textAlign:'center',color:'#9bc6b8',fontSize:9,lineHeight:15,fontWeight:'800',letterSpacing:.2},
})
