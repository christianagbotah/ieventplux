/**
 * Native mobile meeting access: explicitly checks OS permissions using Expo's
 * native APIs and opens the secure web meeting in the system browser.
 *
 * This is NOT yet a native LiveKit video client; that requires a compatible
 * react-native-webrtc + LiveKit custom development build, not Expo Go.
 */
import { useCallback, useEffect, useState } from 'react'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import {
  ActivityIndicator, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { api, ApiClientError, absoluteUrl } from '../api/client'
import type { MeetingAccessScreenProps } from '../navigation'
import { theme } from '../theme'
import {PremiumBackdrop,TileGlyph,LabelPill,mobileDesign} from '../ui/PremiumUI'
import { nativePermissionStatus, secureMeetingUrl } from '../lib/meeting-device-access'
import { mayEnterNativeRoom, validNativeMeetingCredentials } from '../lib/native-meeting-policy'

type MeetingData = Awaited<ReturnType<typeof api.meetings.forEvent>>
type LoadState = { status: 'loading' } | { status: 'error'; reason: string } | { status: 'ready'; data: MeetingData }

export default function MeetingAccessScreen({ route, navigation }: MeetingAccessScreenProps) {
  const { eventId } = route.params
  const [camera, askCamera] = useCameraPermissions()
  const [microphone, askMicrophone] = useMicrophonePermissions()
  const [room, setRoom] = useState<LoadState>({ status: 'loading' })
  const [busy, setBusy] = useState<'camera' | 'microphone' | 'opening' | 'joining' | null>(null)
  const [joinMic, setJoinMic] = useState(true)
  const [joinCamera, setJoinCamera] = useState(true)
  const [preview, setPreview] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setRoom({ status: 'loading' })
    try {
      const data = await api.meetings.forEvent(eventId)
      setRoom({ status: 'ready', data })
    } catch (error) {
      setRoom({
        status: 'error',
        reason: error instanceof ApiClientError ? error.message : 'Unable to load the meeting for this event.',
      })
    }
  }, [eventId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!camera?.granted) setPreview(false) }, [camera?.granted])

  const ask = async (kind: 'camera' | 'microphone') => {
    if (busy) return
    setBusy(kind)
    setNotice('')
    try {
      const result = kind === 'camera' ? await askCamera() : await askMicrophone()
      if (result.granted) {
        setNotice(kind === 'camera'
          ? 'Camera permission granted. You can start a private camera preview below.'
          : 'Microphone permission granted. No audio is recorded by this diagnostic.')
      } else {
        setNotice(kind === 'camera'
          ? 'Camera permission is still denied. Check the phone settings for iEventPlux.'
          : 'Microphone permission is still denied. Check the phone settings for iEventPlux.')
      }
    } catch {
      setNotice('This device could not complete the permission request. Review the app permissions in system settings.')
    } finally { setBusy(null) }
  }

  const openSettings = async () => {
    try { await Linking.openSettings() }
    catch {
      setNotice('Open your phone settings, find iEventPlux, and allow camera and microphone access.')
    }
  }

  const joinNativeMeeting = async () => {
    if (room.status !== 'ready' || !room.data.meeting || busy) return
    const meeting = room.data.meeting
    if (!mayEnterNativeRoom({
      meetingStatus: meeting.status,
      engine: meeting.mediaEngine,
      nativeCapable: Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
    })) {
      setNotice('Native video calling needs a custom iEventPlux build and an active LiveKit meeting.')
      return
    }
    setBusy('joining')
    setNotice('')
    try {
      // Native OS permission prompts are directly tied to this Join button.
      // Both devices can be disabled to join as a listener without prompts.
      if (joinMic && !microphone?.granted) {
        const granted = await askMicrophone()
        if (!granted.granted) throw new Error('Microphone access is required for joining with microphone on. Switch it off to listen only, or allow access in phone settings.')
      }
      if (joinCamera && !camera?.granted) {
        const granted = await askCamera()
        if (!granted.granted) throw new Error('Camera access is required for joining with camera on. Switch it off to join without video, or allow access in phone settings.')
      }
      setPreview(false)
      // The same server-side ticket, RSVP and removal gates protect web and native.
      const credentials = await api.meetings.joinCredentials(meeting.id)
      if (!validNativeMeetingCredentials(credentials)) {
        throw new Error('The media server returned invalid secure meeting credentials.')
      }
      navigation.navigate('NativeMeeting', {
        meetingId: meeting.id, serverUrl: credentials.serverUrl, token: credentials.token,
        microphone: joinMic, camera: joinCamera,
      })
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message :
        error instanceof Error ? error.message : 'Unable to join the live meeting.')
    } finally {
      setBusy(null)
    }
  }

  const openWebMeeting = async () => {
    if (room.status !== 'ready' || !room.data.meeting || busy) return
    const meeting = room.data.meeting
    if (meeting.status !== 'LIVE') {
      setNotice('The organizer has not started this meeting. Please check again later.')
      return
    }
    const url = secureMeetingUrl(absoluteUrl('/'), meeting.id)
    if (!url) {
      setNotice('A secure HTTPS meeting address is not configured. Please contact the event organizer.')
      return
    }
    setPreview(false) // Release the local camera before a separate browser requests it.
    setBusy('opening')
    try {
      await Linking.openURL(url)
      setNotice('Opened the meeting in your system browser. You may need to sign in again there, then allow camera and microphone access.')
    } catch {
      setNotice('Could not open the secure meeting link. Use Chrome or Safari to visit the iEventPlux event page.')
    } finally { setBusy(null) }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.heading}>
      <PremiumBackdrop mode="midnight"/>
      <View style={styles.heroTop}><Text style={styles.eyebrow}>✦  iEVENTPLUX MEETINGS</Text><Text style={styles.heroSymbol}>◎</Text></View>
      <Text style={styles.title}>Your room. Your people. Your moment.</Text>
      <Text style={styles.description}>Join a secure event meeting directly in the app. Choose your camera and microphone preferences before entering.</Text>
      <View style={styles.heroFoot}><Text style={styles.heroFootText}>NATIVE LIVEKIT VIDEO</Text><Text style={styles.heroFootText}>SECURE EVENT ACCESS</Text></View>
    </View>
    {notice?<Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>:null}

    <View style={styles.card}>
      <View style={styles.cardHead}><TileGlyph kind="scanner" size={46}/><View style={styles.cardHeadText}><Text style={styles.cardTitle}>Check your devices</Text><Text style={styles.cardDescription}>OS permissions are requested only when you choose to enable them.</Text></View></View>
      <View style={styles.permissionRow}>
        <View style={styles.permissionInfo}>
          <Text style={styles.permissionTitle}>Camera  ▣</Text>
          <Text style={styles.permissionStatus}>{nativePermissionStatus(camera?.granted, camera?.canAskAgain)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Request native camera permission"
          style={styles.secondaryButton} disabled={busy !== null} onPress={() => void ask('camera')}>
          {busy === 'camera' ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.secondaryText}>{camera?.granted ? 'Recheck' : 'Allow camera'}</Text>}
        </Pressable>
      </View>
      <View style={styles.permissionRow}>
        <View style={styles.permissionInfo}>
          <Text style={styles.permissionTitle}>Microphone  ◉</Text>
          <Text style={styles.permissionStatus}>{nativePermissionStatus(microphone?.granted, microphone?.canAskAgain)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Request native microphone permission"
          style={styles.secondaryButton} disabled={busy !== null} onPress={() => void ask('microphone')}>
          {busy === 'microphone' ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.secondaryText}>{microphone?.granted ? 'Recheck' : 'Allow microphone'}</Text>}
        </Pressable>
      </View>
      {(camera?.canAskAgain === false || microphone?.canAskAgain === false) && <Pressable
        onPress={() => void openSettings()} accessibilityRole="button" style={styles.settingsButton}>
        <Text style={styles.settingsText}>Open app permissions in system settings</Text>
      </Pressable>}
      {camera?.granted && <Pressable
        accessibilityRole="button" accessibilityLabel={preview ? 'Stop local camera preview' : 'Start local camera preview'}
        style={[styles.secondaryButton, styles.previewToggle]} onPress={() => setPreview((current) => !current)}>
        <Text style={styles.secondaryText}>{preview ? 'Stop camera preview' : 'Preview my camera'}</Text>
      </Pressable>}
      {preview && camera?.granted && <View style={styles.previewWrap}>
        <CameraView style={styles.cameraView} facing="front" />
        <Text style={styles.previewNote}>Local preview only · no recording or upload</Text>
      </View>}
    </View>

    <View style={styles.card}>
      <View style={styles.cardHead}><TileGlyph kind="event" size={46}/><View style={styles.cardHeadText}><Text style={styles.cardTitle}>Enter your group meeting</Text><Text style={styles.cardDescription}>Meet attendees and organizers securely.</Text></View></View>
      {room.status === 'loading' ? <ActivityIndicator style={styles.indicator} color={theme.colors.primary} /> :
        room.status === 'error' ? <>
          <Text style={styles.cardDescription}>{room.reason}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void load()} accessibilityRole="button"><Text style={styles.secondaryText}>Retry meeting status</Text></Pressable>
        </> : !room.data.enabled ? <Text style={styles.cardDescription}>Meetings are currently unavailable for this event.</Text>
        : !room.data.meeting ? <Text style={styles.cardDescription}>The organizer has not created a group meeting for this event yet.</Text>
        : <>
          <Text style={styles.meetingTitle}>{room.data.meeting.title}</Text>
          <LabelPill label={room.data.meeting.status==='LIVE'?'● LIVE NOW':room.data.meeting.status.replace(/_/g,' ')} tone={room.data.meeting.status==='LIVE'?'mint':'cream'}/>
          {room.data.meeting.mediaEngine === 'sfu' &&
            Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && <>
            <View style={styles.nativeOptions}>
              <Text style={styles.meetingTitle}>Choose how you join</Text>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: joinMic }}
                style={styles.optionRow} onPress={() => setJoinMic((value) => !value)}>
                <Text style={styles.optionText}>{joinMic ? '☑' : '☐'}  Join with microphone</Text>
              </Pressable>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: joinCamera }}
                style={styles.optionRow} onPress={() => setJoinCamera((value) => !value)}>
                <Text style={styles.optionText}>{joinCamera ? '☑' : '☐'}  Join with camera</Text>
              </Pressable>
              <Text style={styles.cardDescription}>Keep both off for listen-only. All attendees join the same LiveKit event room without an artificial attendee limit.</Text>
            </View>
            <Pressable style={[styles.primaryButton, (room.data.meeting.status !== 'LIVE' || busy !== null) && styles.disabled]}
              disabled={room.data.meeting.status !== 'LIVE' || busy !== null}
              accessibilityRole="button" accessibilityLabel="Join group video meeting in iEventPlux"
              onPress={() => void joinNativeMeeting()}>
              {busy === 'joining' ? <ActivityIndicator color="#ffffff" /> :
                <Text style={styles.primaryText}>Join meeting in iEventPlux  →</Text>}
            </Pressable>
          </>}
          <Pressable style={[styles.secondaryButton, (room.data.meeting.status !== 'LIVE' || busy !== null) && styles.disabled]}
            disabled={room.data.meeting.status !== 'LIVE' || busy !== null}
            accessibilityRole="button" accessibilityLabel="Open live meeting in system browser"
            onPress={() => void openWebMeeting()}>
            {busy === 'opening' ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.secondaryText}>Use browser fallback instead</Text>}
          </Pressable>
        </>}
      <Text style={styles.handoff}>
        Native LiveKit group calls require an installed iEventPlux development/release
        build; they do not run in Expo Go. Browser meeting is retained as a
        fallback and may require browser sign-in separately.
        {' '}Phone screen sharing is not yet implemented in the native room.
      </Text>
    </View>
    <Text style={styles.footer}>Platform: {Platform.OS}. Screen sharing and microphone capture during calls depend on the browser and operating system.</Text>
  </ScrollView>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,paddingBottom:49,gap:17},
  heading:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,padding:24,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.2,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:5},
  heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroSymbol:{fontSize:25,color:mobileDesign.gold},
  eyebrow:{color:'#c7f6e6',fontSize:10,fontWeight:'900',letterSpacing:1.2},
  title:{color:'#fff',fontSize:28,lineHeight:36,fontWeight:'900',letterSpacing:-.9,marginTop:21},
  description:{color:'#def2eb',fontSize:13,lineHeight:22,marginTop:12},
  heroFoot:{marginTop:21,paddingTop:15,borderTopWidth:1,borderTopColor:'#ffffff40',flexDirection:'row',flexWrap:'wrap',gap:12},
  heroFootText:{fontSize:9,fontWeight:'900',color:'#d4f4e6',letterSpacing:.65},
  card:{backgroundColor:'#fff',borderRadius:23,borderWidth:1,borderColor:mobileDesign.border,padding:17,gap:15,
    shadowColor:mobileDesign.shadow,shadowOpacity:.05,shadowRadius:12,shadowOffset:{width:0,height:7},elevation:2},
  cardHead:{flexDirection:'row',alignItems:'center',gap:12},cardHeadText:{flex:1,gap:5},
  cardTitle:{color:mobileDesign.ink,fontSize:17,fontWeight:'900'},
  cardDescription:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:19},
  permissionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderTopWidth:1,borderColor:mobileDesign.border,paddingTop:15,gap:10},
  permissionInfo:{flex:1},permissionTitle:{color:mobileDesign.ink,fontSize:14,fontWeight:'900'},
  permissionStatus:{color:mobileDesign.inkMuted,fontSize:11,marginTop:5,lineHeight:17},
  secondaryButton:{borderColor:'#c2e6d6',backgroundColor:mobileDesign.mintSoft,borderWidth:1,borderRadius:15,minHeight:48,minWidth:106,alignItems:'center',justifyContent:'center',paddingHorizontal:13},
  secondaryText:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12,textAlign:'center'},
  previewToggle:{alignSelf:'flex-start'},previewWrap:{overflow:'hidden',borderRadius:17,backgroundColor:mobileDesign.forestDeep},
  cameraView:{width:'100%',aspectRatio:4/3},previewNote:{color:'#e5f7ed',fontSize:11,padding:12,textAlign:'center'},
  settingsButton:{padding:14,borderRadius:15,backgroundColor:'#fff4e9'},settingsText:{color:'#8b5318',fontSize:12,fontWeight:'900'},
  notice:{fontSize:12,lineHeight:20,padding:14,borderRadius:16,color:mobileDesign.forest,backgroundColor:mobileDesign.mintSoft},
  meetingTitle:{color:mobileDesign.ink,fontSize:15,fontWeight:'900',lineHeight:22},
  primaryButton:{backgroundColor:mobileDesign.emerald,minHeight:54,borderRadius:17,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  primaryText:{color:'#fff',fontSize:13,fontWeight:'900',textAlign:'center'},
  nativeOptions:{marginTop:8,borderTopWidth:1,borderColor:mobileDesign.border,paddingTop:15,gap:9},
  optionRow:{minHeight:50,justifyContent:'center',backgroundColor:'#f6f9f8',borderRadius:14,paddingHorizontal:13,borderWidth:1,borderColor:mobileDesign.border},
  optionText:{fontSize:13,fontWeight:'800',color:mobileDesign.ink},disabled:{opacity:.47},
  handoff:{paddingTop:13,borderTopWidth:1,borderColor:mobileDesign.border,color:mobileDesign.inkMuted,fontSize:11,lineHeight:18},
  indicator:{marginVertical:15},footer:{color:mobileDesign.inkMuted,fontSize:11,lineHeight:18,textAlign:'center'},
})
