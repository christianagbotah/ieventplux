/**
 * Native opt-in event networking. No attendee directory is fetched or
 * displayed until the existing server confirms eligibility AND consent.
 * Identifiers and profile images stay in memory, never in an offline cache.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native'
import {
  absoluteUrl, api, ApiClientError, type EventNetworkResponse, type NetworkMember,
} from '../api/client'
import { ActionDialog, type ActionPrompt } from '../components/ActionDialog'
import { mergeNetworkMembers, visibleEventNetwork } from '../lib/event-social-policy'
import { theme } from '../theme'
import {PremiumBackdrop,TileGlyph,LabelPill,mobileDesign} from '../ui/PremiumUI'
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
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null)
  const requestRevision = useRef(0)

  const load = useCallback(async (after?: string) => {
    const revision = ++requestRevision.current
    if (after) setLoadingMore(true)
    else setLoading(true)
    try {
      const result = await api.networking.list(eventId, after)
      if (revision !== requestRevision.current) return
      setNetwork(result)
      setMembers((old) => mergeNetworkMembers(old, visibleEventNetwork(result), Boolean(after)))
      setCursor(result.hasMore ? result.nextCursor : null)
      setError('')
    } catch (reason) {
      if (revision !== requestRevision.current) return
      // Do not keep showing stale attendee identities after entitlement,
      // authentication, or privacy changes.
      setNetwork(null)
      setMembers([])
      setCursor(null)
      setError(reason instanceof ApiClientError ? reason.message : 'Unable to load the private attendee network.')
    } finally {
      if (revision === requestRevision.current) {setLoading(false);setLoadingMore(false)}
    }
  }, [eventId])

  useEffect(() => { void load(); return () => {requestRevision.current++} }, [load])

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
              requestRevision.current++
              setNetwork(old => old ? { ...old, optedIn: false, items: [], hasMore: false, nextCursor: null } : null)
              setMembers([])
              setCursor(null)
            }
            await load()
            setError('')
            setFeedback(join ? 'Your profile is now available to other consenting attendees.' : 'You have left the attendee network.')
          } catch (reason) {
            setFeedback('')
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
            setError('')
            setFeedback(blocked ? 'Attendee blocked.' : 'Your report was submitted for review.')
          } catch (reason) {
            setFeedback('')
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
        <PremiumBackdrop mode="midnight"/>
        <View style={styles.heroTop}><Text style={styles.eyebrow}>✦  YOUR EVENT NETWORK</Text><Text style={styles.heroSymbol}>◎</Text></View>
        <Text style={styles.title}>Make connections that last.</Text>
        <Text numberOfLines={2} style={styles.heroSubtitle}>{eventTitle}</Text>
        <Text style={styles.heroDescription}>Meet people who share your interests, with full control over your privacy.</Text>
        <View style={styles.heroMeta}><Text style={styles.heroMetaLabel}>PRIVATE BY DEFAULT</Text><Text style={styles.heroMetaLabel}>YOU CONTROL VISIBILITY</Text></View>
      </View>
      <View style={styles.privacy}>
        <TileGlyph kind="organizer" size={44}/>
        <View style={styles.privacyBody}><Text style={styles.privacyTitle}>Your privacy comes first</Text>
        <Text style={styles.privacyText}>A ticket does not make you visible. Attendees must opt in independently; emails, phone numbers, tickets and payment records remain private.</Text></View>
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
          <View style={styles.consentTop}><View style={styles.consentHeadline}><Text style={styles.cardTitle}>{optedIn ? 'Your profile is discoverable' : 'Your profile is private'}</Text><Text style={styles.muted}>{optedIn?'You are in control of who can find you':'Choose when you want to be discovered'}</Text></View><LabelPill label={optedIn?'JOINED':'PRIVATE'} tone={optedIn?'mint':'light'}/></View>
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
            <View><Text style={styles.sectionEyebrow}>YOUR EVENT CIRCLE</Text><Text style={styles.sectionTitle}>People to meet</Text></View>
            <Pressable accessibilityRole="button" onPress={() => void load()} disabled={loading}>
              <Text style={styles.link}>Refresh</Text>
            </Pressable>
          </View>
          {members.length === 0 ? <View style={styles.empty}>
            <TileGlyph kind="organizer" size={70}/>
            <Text style={styles.cardTitle}>You are among the first</Text>
            <Text style={styles.muted}>Other people appear only after they consent and meet the same event access rules.</Text>
          </View> : members.map(member => <View key={member.id} style={styles.person}>
            {member.avatarUrl && absoluteUrl(member.avatarUrl) ? <Image source={{ uri: absoluteUrl(member.avatarUrl)! }} style={styles.avatar} accessibilityLabel={member.displayName+' public profile photo'}/> :
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
      {feedback ? <Text accessibilityRole="alert" style={styles.success}>{feedback}</Text> : null}
      {error ? <View style={styles.errorBox}>
        <Text accessibilityRole="alert" style={styles.feedback}>{error}</Text>
        {!network && <Pressable accessibilityRole="button" onPress={() => void load()}
          style={styles.outlineButton}><Text style={styles.outlineText}>Retry</Text></Pressable>}
      </View> : null}
    </ScrollView>
    <ActionDialog prompt={prompt} onDismiss={() => setPrompt(null)} busy={working !== null} />
  </View>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,gap:17,paddingBottom:45},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,padding:24,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.18,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:5},
  heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroSymbol:{fontSize:25,color:mobileDesign.gold},
  eyebrow:{color:'#c5f5e4',fontSize:10,fontWeight:'900',letterSpacing:1.15},
  title:{color:'#fff',fontSize:29,lineHeight:37,letterSpacing:-1,fontWeight:'900',marginTop:21},
  heroSubtitle:{color:'#fff',fontSize:13,fontWeight:'900',marginTop:13},
  heroDescription:{color:'#dcf4eb',fontSize:13,lineHeight:21,marginTop:8},
  heroMeta:{flexDirection:'row',flexWrap:'wrap',gap:12,borderTopWidth:1,borderTopColor:'#ffffff40',marginTop:20,paddingTop:14},
  heroMetaLabel:{fontSize:9,color:'#ceebe2',fontWeight:'900',letterSpacing:.8},
  privacy:{backgroundColor:mobileDesign.mintSoft,borderRadius:18,padding:15,gap:12,flexDirection:'row',alignItems:'flex-start'},privacyBody:{flex:1},
  privacyTitle:{color:mobileDesign.forest,fontSize:13,fontWeight:'900'},privacyText:{color:'#35665b',fontSize:11,lineHeight:19,marginTop:6},
  card:{backgroundColor:'#fff',borderRadius:23,borderWidth:1,borderColor:mobileDesign.border,padding:18,gap:14,
    shadowColor:mobileDesign.shadow,shadowOpacity:.05,shadowRadius:13,shadowOffset:{width:0,height:7},elevation:2},
  cardTitle:{color:mobileDesign.ink,fontWeight:'900',fontSize:16,lineHeight:22},muted:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:20},
  consentTop:{flexDirection:'row',alignItems:'flex-start',gap:9},consentHeadline:{flex:1,gap:6},
  loading:{padding:27,justifyContent:'center',alignItems:'center',gap:12},
  primaryButton:{backgroundColor:mobileDesign.emerald,borderRadius:15,minHeight:50,alignItems:'center',justifyContent:'center',paddingHorizontal:15},
  primaryText:{color:'#fff',fontSize:13,fontWeight:'900'},
  outlineButton:{borderWidth:1,borderColor:'#c6e7d9',backgroundColor:mobileDesign.mintSoft,borderRadius:15,minHeight:48,justifyContent:'center',alignItems:'center',paddingHorizontal:14},
  outlineText:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},disabled:{opacity:.5},
  sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4},
  sectionEyebrow:{fontSize:9,color:mobileDesign.emerald,fontWeight:'900',letterSpacing:1},sectionTitle:{fontSize:21,color:mobileDesign.ink,fontWeight:'900',marginTop:4},
  link:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},
  empty:{padding:24,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff',borderRadius:23,alignItems:'center',gap:12},
  person:{flexDirection:'row',gap:12,alignItems:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:21,padding:15,
    shadowColor:mobileDesign.shadow,shadowOpacity:.045,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:2},
  avatar:{width:54,height:54,borderRadius:17},avatarFallback:{backgroundColor:mobileDesign.mintSoft,justifyContent:'center',alignItems:'center'},
  avatarInitial:{color:mobileDesign.emerald,fontSize:20,fontWeight:'900'},
  personBody:{flex:1,gap:5,minWidth:0},personName:{color:mobileDesign.ink,fontWeight:'900',fontSize:15},
  actions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:8},
  smallButton:{minHeight:43,justifyContent:'center',paddingHorizontal:10,backgroundColor:'#f4f6f8',borderRadius:13},
  outlineSmall:{minHeight:43,borderWidth:1,borderColor:'#c7e7d8',backgroundColor:mobileDesign.mintSoft,borderRadius:13,paddingHorizontal:15,justifyContent:'center'},
  mutedLink:{color:mobileDesign.inkMuted,fontSize:11,fontWeight:'900'},dangerLink:{color:theme.colors.danger,fontSize:11,fontWeight:'900'},
  errorBox:{backgroundColor:'#fff0ee',borderRadius:15,padding:14,gap:10},feedback:{fontSize:12,color:theme.colors.danger,lineHeight:19},
  success:{fontSize:12,color:mobileDesign.emerald,lineHeight:19,backgroundColor:mobileDesign.mintSoft,padding:14,borderRadius:14},
})
