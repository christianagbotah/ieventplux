/**
 * Native opt-in event networking. No attendee directory is fetched or
 * displayed until the existing server confirms eligibility AND consent.
 * Identifiers and profile images stay in memory, never in an offline cache.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native'
import {
  api, ApiClientError, type EventNetworkResponse, type NetworkMember,
} from '../api/client'
import { ActionDialog, type ActionPrompt } from '../components/ActionDialog'
import { mergeNetworkMembers, visibleEventNetwork } from '../lib/event-social-policy'
import { theme } from '../theme'
import type { EventNetworkScreenProps } from '../navigation'

export default function EventNetworkScreen({ route }: EventNetworkScreenProps) {
  const { eventId, eventTitle } = route.params
  const [network, setNetwork] = useState<EventNetworkResponse | null>(null)
  const [members, setMembers] = useState<NetworkMember[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null)

  const load = useCallback(async (after?: string) => {
    if (after) setLoadingMore(true)
    else setLoading(true)
    try {
      const result = await api.networking.list(eventId, after)
      setNetwork(result)
      setMembers((old) => mergeNetworkMembers(old, visibleEventNetwork(result), Boolean(after)))
      setCursor(result.hasMore ? result.nextCursor : null)
      setError('')
    } catch (reason) {
      // Do not keep showing stale attendee identities after entitlement,
      // authentication, or privacy changes.
      setNetwork(null)
      setMembers([])
      setCursor(null)
      setError(reason instanceof ApiClientError ? reason.message : 'Unable to load the private attendee network.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [eventId])

  useEffect(() => { void load() }, [load])

  const changeConsent = (join: boolean) => {
    setPrompt({
      title: join ? 'Join this event network?' : 'Leave this event network?',
      description: join
        ? 'Only other eligible attendees who also opt in can see your display name and profile photo. Your phone, email, ticket and other personal records are never shown.'
        : 'Your name will disappear from this event network. Existing follows are separate and can be managed from your profile.',
      confirmLabel: join ? 'Join network' : 'Leave network',
      destructive: !join,
      onConfirm: () => {
        if (working) return
        setWorking('consent')
        void (async () => {
          try {
            await api.networking.consent(eventId, join ? 'join' : 'leave')
            // Do not render stale private profiles when revoking consent.
            if (!join) {
              setNetwork(old => old ? { ...old, optedIn: false, items: [], hasMore: false, nextCursor: null } : null)
              setMembers([])
              setCursor(null)
            }
            await load()
            setError(join ? 'Your profile is now available to other consenting attendees.' : 'You have left the attendee network.')
          } catch (reason) {
            setError(reason instanceof ApiClientError ? reason.message : 'Could not update your networking consent.')
          } finally { setWorking(null); setPrompt(null) }
        })()
      },
    })
  }

  const changeFollow = async (member: NetworkMember) => {
    if (working) return
    setWorking(member.id)
    try {
      const result = await api.networking.follow(member.id, member.following ? 'unfollow' : 'follow')
      setMembers(current => current.map(row => row.id === member.id
        ? { ...row, following: result.following } : row))
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : 'Cannot update this follow.')
    } finally { setWorking(null) }
  }

  const safetyAction = (member: NetworkMember, kind: 'report' | 'block') => {
    const blocked = kind === 'block'
    setPrompt({
      title: blocked ? 'Block this attendee?' : 'Report this profile?',
      description: blocked
        ? 'You will no longer see each other in event networks. You can manage blocked accounts in your privacy settings.'
        : 'The platform moderation team will receive your report. This does not automatically block the account.',
      confirmLabel: blocked ? 'Block attendee' : 'Submit report',
      destructive: blocked,
      onConfirm: () => {
        if (working) return
        setWorking(member.id)
        void (async () => {
          try {
            if (blocked) {
              await api.networking.block(member.id)
              setMembers(current => current.filter(row => row.id !== member.id))
            } else {
              await api.networking.report(member.id)
            }
            setError(blocked ? 'Attendee blocked.' : 'Your report was submitted for review.')
          } catch (reason) {
            setError(reason instanceof ApiClientError ? reason.message : 'Could not complete the action.')
          } finally { setWorking(null); setPrompt(null) }
        })()
      },
    })
  }

  const eligible = network?.eligible === true
  const optedIn = eligible && network?.optedIn === true

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>CONSENT-BASED NETWORKING</Text>
        <Text style={styles.title}>Meet fellow attendees</Text>
        <Text numberOfLines={3} style={styles.heroSubtitle}>{eventTitle}</Text>
        <Text style={styles.heroDescription}>Make professional connections without publishing your attendee details.</Text>
      </View>
      <View style={styles.privacy}>
        <Text style={styles.privacyTitle}>Private by default</Text>
        <Text style={styles.privacyText}>
          Buying a ticket or reserving a seat does not list you. Both people
          must independently join this network to see one another. Email,
          phone numbers, ticket details and payment records remain private.
        </Text>
      </View>
      {loading && !network ? <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.muted}>Checking event access…</Text>
      </View> : network && !eligible ? <View style={styles.card}>
        <Text style={styles.cardTitle}>Only verified event participants can join</Text>
        <Text style={styles.muted}>
          An approved free-event RSVP, a valid ticket, or an accepted organizer
          role is needed. Marking yourself Going does not grant access.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.outlineButton}>
          <Text style={styles.outlineText}>Check access again</Text>
        </Pressable>
      </View> : eligible ? <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{optedIn ? 'You are visible to consenting attendees' : 'Your profile is hidden'}</Text>
          <Text style={styles.muted}>{optedIn
            ? 'You can leave this event network at any time.'
            : 'Opt in only if you want to be discovered by eligible attendees who have also opted in.'}</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel={optedIn ? 'Leave attendee network' : 'Join attendee network'}
            disabled={working !== null} onPress={() => changeConsent(!optedIn)}
            style={[optedIn ? styles.outlineButton : styles.primaryButton, working !== null && styles.disabled]}>
            <Text style={optedIn ? styles.outlineText : styles.primaryText}>{optedIn ? 'Leave network' : 'Join network'}</Text>
          </Pressable>
        </View>
        {optedIn && <>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>People open to connecting</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()} disabled={loading}>
              <Text style={styles.link}>Refresh</Text>
            </Pressable>
          </View>
          {members.length === 0 ? <View style={styles.empty}>
            <Text style={styles.cardTitle}>You are among the first</Text>
            <Text style={styles.muted}>Other people appear only after they consent and meet the same event access rules.</Text>
          </View> : members.map(member => <View key={member.id} style={styles.person}>
            {member.avatarUrl ? <Image source={{ uri: member.avatarUrl }} style={styles.avatar} /> :
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(member.displayName || '?').slice(0, 1).toUpperCase()}</Text>
              </View>}
            <View style={styles.personBody}>
              <Text numberOfLines={1} style={styles.personName}>{member.displayName}</Text>
              <Text style={styles.muted}>{member.isMe ? 'You' : 'Consenting event attendee'}</Text>
              {!member.isMe && <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={working !== null}
                  onPress={() => void changeFollow(member)} style={styles.outlineSmall}>
                  <Text style={styles.link}>{working === member.id ? 'Working…' : member.following ? 'Following' : 'Follow'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => safetyAction(member, 'report')}
                  style={styles.smallButton}><Text style={styles.mutedLink}>Report</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => safetyAction(member, 'block')}
                  style={styles.smallButton}><Text style={styles.dangerLink}>Block</Text></Pressable>
              </View>}
            </View>
          </View>)}
          {cursor ? <Pressable accessibilityRole="button" disabled={loadingMore}
            onPress={() => void load(cursor)} style={styles.outlineButton}>
            <Text style={styles.outlineText}>{loadingMore ? 'Loading…' : 'Show more attendees'}</Text>
          </Pressable> : null}
        </>}
      </> : null}
      {error ? <View style={styles.errorBox}>
        <Text accessibilityRole="alert" style={styles.feedback}>{error}</Text>
        {!network && <Pressable accessibilityRole="button" onPress={() => void load()}
          style={styles.outlineButton}><Text style={styles.outlineText}>Retry</Text></Pressable>}
      </View> : null}
    </ScrollView>
    <ActionDialog prompt={prompt} onDismiss={() => setPrompt(null)} busy={working !== null} />
  </View>
}

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor:theme.colors.bg },
  content: { padding:16, gap:14, paddingBottom:45 },
  hero: { backgroundColor:'#08372b', borderRadius:22, padding:20, gap:10 },
  eyebrow: { color:'#88eab8', fontSize:10, fontWeight:'800', letterSpacing:2 },
  title: { color:'#ffffff', fontSize:24, fontWeight:'800' },
  heroSubtitle: { color:'#e5fff1', fontSize:14, fontWeight:'700' },
  heroDescription: { color:'#bbe9d1', fontSize:12, lineHeight:20 },
  privacy: { backgroundColor:'#e8f5ed', borderWidth:1, borderColor:'#bfdccb', borderRadius:16, padding:15, gap:6 },
  privacyTitle: { color:theme.colors.primaryDark, fontSize:14, fontWeight:'800' },
  privacyText: { color:theme.colors.primaryDark, fontSize:12, lineHeight:20 },
  card: { backgroundColor:theme.colors.card, borderRadius:17, borderWidth:1,
    borderColor:theme.colors.border, padding:17, gap:12 },
  cardTitle: { color:theme.colors.text, fontWeight:'800', fontSize:16 },
  muted: { color:theme.colors.textMuted, fontSize:12, lineHeight:19 },
  loading: { padding:28, justifyContent:'center', alignItems:'center', gap:12 },
  primaryButton: { backgroundColor:theme.colors.primary, borderRadius:12, minHeight:48,
    alignItems:'center', justifyContent:'center', paddingHorizontal:15 },
  primaryText: { color:'#ffffff', fontSize:13, fontWeight:'800' },
  outlineButton: { borderWidth:1, borderColor:theme.colors.primary, borderRadius:12, minHeight:46,
    justifyContent:'center', alignItems:'center', paddingHorizontal:14 },
  outlineText: { color:theme.colors.primaryDark, fontWeight:'800', fontSize:13 },
  disabled: { opacity:0.45 },
  sectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:5 },
  link: { color:theme.colors.primaryDark, fontWeight:'800', fontSize:12 },
  empty: { padding:22, borderWidth:1, borderStyle:'dashed', borderColor:theme.colors.border,
    backgroundColor:theme.colors.card, borderRadius:16, alignItems:'center', gap:8 },
  person: { flexDirection:'row', gap:12, backgroundColor:theme.colors.card, borderWidth:1,
    borderColor:theme.colors.border, borderRadius:16, padding:13 },
  avatar: { width:48, height:48, borderRadius:24 },
  avatarFallback: { backgroundColor:'#daf0e5', justifyContent:'center', alignItems:'center' },
  avatarInitial: { color:theme.colors.primaryDark, fontSize:18, fontWeight:'800' },
  personBody: { flex:1, gap:3, minWidth:0 },
  personName: { color:theme.colors.text, fontWeight:'800', fontSize:14 },
  actions: { flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:12, marginTop:7 },
  smallButton: { minHeight:35, justifyContent:'center', paddingHorizontal:4 },
  outlineSmall: { minHeight:37, borderWidth:1, borderColor:theme.colors.border,
    borderRadius:9, paddingHorizontal:12, justifyContent:'center' },
  mutedLink: { color:theme.colors.textMuted, fontSize:12, fontWeight:'700' },
  dangerLink: { color:theme.colors.danger, fontSize:12, fontWeight:'700' },
  errorBox: { backgroundColor:'#fff4e0', borderRadius:13, padding:12, gap:10 },
  feedback: { fontSize:13, color:'#714513', lineHeight:19 },
})
