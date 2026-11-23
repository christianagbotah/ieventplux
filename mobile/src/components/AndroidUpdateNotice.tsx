/**
 * Opt-in in-app notice for a NEWLY PUBLISHED and VERIFIED Android QA APK.
 * Never auto-download/install arbitrary binaries and never block entry.
 *
 * Expo/Play Store releases are separate future distribution channels.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { shouldOfferAndroidUpdate, type QaAndroidRelease, type QaAndroidReleaseResponse } from '../lib/android-updates'
import { theme } from '../theme'

const ENDPOINT = 'https://ieventplux.lightworldtech.com/api/v1/mobile/releases/android'

export function AndroidUpdateNotice() {
  const [latest, setLatest] = useState<QaAndroidRelease | null>(null)
  const [opening, setOpening] = useState(false)
  const dismissedRevision = useRef<string | null>(null)

  const check = useCallback(async () => {
    if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return
    const installedRevision = typeof Constants.expoConfig?.extra?.androidBuildRevision === 'string'
      ? Constants.expoConfig.extra.androidBuildRevision : null
    const installedBuiltAt = typeof Constants.expoConfig?.extra?.androidBuiltAt === 'string'
      ? Constants.expoConfig.extra.androidBuiltAt : null
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6500)
    try {
      const response = await fetch(ENDPOINT, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) return
      const body = await response.json() as QaAndroidReleaseResponse
      if (body.channel !== 'qa' || body.platform !== 'android') return
      if (shouldOfferAndroidUpdate({release:body.latest,installedRevision,installedBuiltAt}) &&
        body.latest && dismissedRevision.current !== body.latest.revision) {
        setLatest(previous => previous?.revision === body.latest?.revision ? previous : body.latest)
      } else {
        setLatest(null)
      }
    } catch {
      // Offline devices must remain usable; failed update checks are silent.
    } finally { clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    void check()
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check()
    })
    return () => subscription.remove()
  }, [check])

  const dismiss = () => {
    dismissedRevision.current = latest?.revision ?? null
    setLatest(null)
  }
  const install = async () => {
    if (!latest || opening) return
    setOpening(true)
    try {
      await Linking.openURL(latest.downloadUrl)
      dismiss()
    } catch {
      // Browser/installer may be unavailable; keep the update prompt open.
    } finally { setOpening(false) }
  }

  if (!latest) return null
  return <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
    <View style={styles.scrim}>
      <View style={styles.dialog} accessibilityRole="alert">
        <View style={styles.icon}><Text style={styles.iconText}>↑</Text></View>
        <Text style={styles.eyebrow}>NEW TEST VERSION AVAILABLE</Text>
        <Text style={styles.title}>Update iEventPlux</Text>
        <Text style={styles.description}>A newer Android test app is ready with improvements and fixes. Continue using this version or open the official download page to install the update.</Text>
        <Text style={styles.note}>Build {latest.revision.slice(0, 9)} · Test release, not Google Play</Text>
        <Text style={styles.note}>Android may require permission to install downloaded apps. A signing mismatch with an older QA build can require one uninstall and reinstall.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Get the newer iEventPlux Android test version"
          disabled={opening} onPress={() => void install()} style={styles.primary}>
          <Text style={styles.primaryText}>{opening ? 'Opening download…' : 'Download update'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now, continue using this version"
          onPress={dismiss} style={styles.later}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  scrim: {flex:1,backgroundColor:'rgba(4,25,19,0.76)',justifyContent:'center',padding:22},
  dialog:{maxWidth:420,width:'100%',alignSelf:'center',backgroundColor:'#fff',borderRadius:24,padding:23,alignItems:'center',gap:11},
  icon:{height:58,width:58,borderRadius:17,backgroundColor:'#e5f7eb',alignItems:'center',justifyContent:'center'},
  iconText:{fontSize:30,fontWeight:'900',color:theme.colors.primaryDark},
  eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.2,color:theme.colors.primaryDark},
  title:{fontSize:22,fontWeight:'800',color:theme.colors.text,textAlign:'center'},
  description:{fontSize:13,lineHeight:20,color:theme.colors.textMuted,textAlign:'center'},
  note:{fontSize:11,lineHeight:18,color:theme.colors.textMuted,textAlign:'center'},
  primary:{width:'100%',minHeight:48,backgroundColor:theme.colors.primary,borderRadius:13,alignItems:'center',justifyContent:'center',marginTop:4},
  primaryText:{fontSize:15,fontWeight:'800',color:'#fff'},
  later:{minHeight:45,alignItems:'center',justifyContent:'center',width:'100%'},
  laterText:{fontSize:14,fontWeight:'700',color:theme.colors.primaryDark},
})
