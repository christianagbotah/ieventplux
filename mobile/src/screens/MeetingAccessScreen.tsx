/**
 * Native mobile meeting access: explicitly checks OS permissions using Expo's
 * native APIs and opens the secure web meeting in the system browser.
 *
 * This is NOT yet a native LiveKit video client; that requires a compatible
 * react-native-webrtc + LiveKit custom development build, not Expo Go.
 */
import { useCallback, useEffect, useState } from 'react'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { api, ApiClientError, absoluteUrl } from '../api/client'
import type { MeetingAccessScreenProps } from '../navigation'
import { theme } from '../theme'
import { nativePermissionStatus, secureMeetingUrl } from '../lib/meeting-device-access'

type MeetingData = Awaited<ReturnType<typeof api.meetings.forEvent>>
type LoadState = { status: 'loading' } | { status: 'error'; reason: string } | { status: 'ready'; data: MeetingData }

export default function MeetingAccessScreen({ route }: MeetingAccessScreenProps) {
  const { eventId } = route.params
  const [camera, askCamera] = useCameraPermissions()
  const [microphone, askMicrophone] = useMicrophonePermissions()
  const [room, setRoom] = useState<LoadState>({ status: 'loading' })
  const [busy, setBusy] = useState<'camera' | 'microphone' | 'opening' | null>(null)
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
      Alert.alert('Device settings', 'Open your phone settings, find iEventPlux, and allow camera and microphone access.')
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
      Alert.alert('Open meeting in browser', 'Could not open the secure meeting link. Use Chrome or Safari to visit the iEventPlux event page.')
    } finally { setBusy(null) }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>NATIVE DEVICE CHECK</Text>
      <Text style={styles.title}>Ready for your meeting?</Text>
      <Text style={styles.description}>Check your phone's camera and microphone permissions before you enter the live room. Nothing is recorded or uploaded by these checks.</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Device access</Text>
      <Text style={styles.cardDescription}>Permissions are requested directly from Android or iOS when you tap each button.</Text>
      <View style={styles.permissionRow}>
        <View style={styles.permissionInfo}>
          <Text style={styles.permissionTitle}>Camera</Text>
          <Text style={styles.permissionStatus}>{nativePermissionStatus(camera?.granted, camera?.canAskAgain)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Request native camera permission"
          style={styles.secondaryButton} disabled={busy !== null} onPress={() => void ask('camera')}>
          {busy === 'camera' ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.secondaryText}>{camera?.granted ? 'Recheck' : 'Allow camera'}</Text>}
        </Pressable>
      </View>
      <View style={styles.permissionRow}>
        <View style={styles.permissionInfo}>
          <Text style={styles.permissionTitle}>Microphone</Text>
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
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Group meeting</Text>
      {room.status === 'loading' ? <ActivityIndicator style={styles.indicator} color={theme.colors.primary} /> :
        room.status === 'error' ? <>
          <Text style={styles.cardDescription}>{room.reason}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void load()} accessibilityRole="button"><Text style={styles.secondaryText}>Retry meeting status</Text></Pressable>
        </> : !room.data.enabled ? <Text style={styles.cardDescription}>Meetings are currently unavailable for this event.</Text>
        : !room.data.meeting ? <Text style={styles.cardDescription}>The organizer has not created a group meeting for this event yet.</Text>
        : <>
          <Text style={styles.meetingTitle}>{room.data.meeting.title}</Text>
          <Text style={styles.cardDescription}>Meeting status: {room.data.meeting.status}</Text>
          <Pressable style={[styles.primaryButton, (room.data.meeting.status !== 'LIVE' || busy !== null) && styles.disabled]}
            disabled={room.data.meeting.status !== 'LIVE' || busy !== null}
            accessibilityRole="button" accessibilityLabel="Open live meeting in system browser"
            onPress={() => void openWebMeeting()}>
            {busy === 'opening' ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Open live meeting securely</Text>}
          </Pressable>
        </>}
      <Text style={styles.handoff}>
        Video calls currently run through the secure iEventPlux web meeting in your system browser.
        {' '}This native app can request device permissions, but does not yet contain the native LiveKit video engine.
        {' '}Browser sign-in may be required separately.
      </Text>
    </View>
    <Text style={styles.footer}>Platform: {Platform.OS}. Screen sharing and microphone capture during calls depend on the browser and operating system.</Text>
  </ScrollView>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.lg, paddingBottom: 48, gap: 16 },
  heading: { paddingVertical: 8 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '800', marginBottom: 8 },
  description: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: theme.colors.card, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, padding: 17, gap: 13 },
  cardTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  cardDescription: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 21 },
  permissionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12, gap: 10 },
  permissionInfo: { flex: 1 },
  permissionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  permissionStatus: { color: theme.colors.textMuted, fontSize: 12, marginTop: 3 },
  secondaryButton: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 12, minHeight: 44, minWidth: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 12 },
  previewToggle: { alignSelf: 'flex-start', marginTop: 3 },
  previewWrap: { overflow: 'hidden', borderRadius: 14, backgroundColor: '#081b18' },
  cameraView: { width: '100%', aspectRatio: 4 / 3 },
  previewNote: { color: '#e1f5ec', fontSize: 11, padding: 10, textAlign: 'center' },
  settingsButton: { padding: 12, borderRadius: 12, backgroundColor: '#fff7ed' },
  settingsText: { color: '#9a3412', fontSize: 13, fontWeight: '700' },
  notice: { fontSize: 12, lineHeight: 19, padding: 12, borderRadius: 10, color: theme.colors.primaryDark, backgroundColor: '#ecfdf5' },
  meetingTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  primaryButton: { marginTop: 4, backgroundColor: theme.colors.primary, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  handoff: { paddingTop: 10, borderTopWidth: 1, borderColor: theme.colors.border, color: theme.colors.textMuted, fontSize: 12, lineHeight: 19 },
  indicator: { marginVertical: 15 },
  footer: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
})
