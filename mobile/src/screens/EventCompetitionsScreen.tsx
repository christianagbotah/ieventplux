/**
 * Event awards and free supporter voting. Same durable server ballots and
 * visibility rules as the web event page. No offline votes or local tallies.
 */
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { api, ApiClientError, type EventCompetitionView, type CompetitionNomineeView, type CompetitionCategoryView } from '../api/client'
import { ActionDialog, type ActionPrompt } from '../components/ActionDialog'
import { useSession } from '../store/session'
import { theme } from '../theme'
import type { EventCompetitionsScreenProps } from '../navigation'

function timeLabel(value: string) {
  const date = Date.parse(value)
  return Number.isFinite(date) ? new Date(date).toLocaleString() : 'Time to be announced'
}

export default function EventCompetitionsScreen({ route, navigation }: EventCompetitionsScreenProps) {
  const { eventId, eventTitle } = route.params
  const { user } = useSession()
  const [competitions, setCompetitions] = useState<EventCompetitionView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null)
  const load = useCallback(async () => {
    try {
      const response = await api.competitions.list(eventId)
      setCompetitions(response.competitions)
      setError('')
    } catch (reason) {
      // Withholding a private event roster/ballot on access failure prevents
      // stale competition identities from remaining visible after revocation.
      setCompetitions([])
      setError(reason instanceof ApiClientError ? reason.message : 'Cannot load award competitions.')
    } finally { setLoading(false) }
  }, [eventId])

  useEffect(() => { void load() }, [load, user?.id])
  useEffect(() => {
    const timer = setInterval(() => { void load() }, 30000)
    return () => clearInterval(timer)
  }, [load])

  function confirmVote(contest: EventCompetitionView, category: CompetitionCategoryView, nominee: CompetitionNomineeView) {
    if (busy || !contest.canVote || category.myNomineeId) return
    if (!user) {
      navigation.navigate('Login')
      return
    }
    setPrompt({
      title: 'Vote for ' + nominee.name + '?',
      description: 'You have one FREE vote in the ' + category.title + ' category. You cannot change your selection later. No payment will be taken.',
      confirmLabel: 'Cast free vote',
      onConfirm: () => {
        if (busy) return
        setBusy(true)
        void (async () => {
          try {
            await api.competitions.vote(contest.id, category.id, nominee.id)
            await load()
            setFeedback('Your vote for ' + nominee.name + ' was recorded securely.')
          } catch (reason) {
            await load()
            setError(reason instanceof ApiClientError ? reason.message : 'Your vote could not be recorded.')
          } finally {
            setBusy(false)
            setPrompt(null)
          }
        })()
      },
    })
  }

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LIVE EVENTS • AWARDS • TALENT</Text>
        <Text style={styles.title}>Support your favourites</Text>
        <Text style={styles.heroText}>{eventTitle}</Text>
        <Text style={styles.heroNote}>Vote for nominees, follow result announcements, and celebrate artists and contestants.</Text>
      </View>
      <View style={styles.security}>
        <Text style={styles.securityTitle}>Fair voting</Text>
        <Text style={styles.securityBody}>One free vote per person’s account and award category. Only your confirmed vote is shown to you; public counts follow the organizer’s published results policy.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.secondary}>
        <Text style={styles.secondaryLabel}>Refresh results</Text>
      </Pressable>
      {loading && !competitions.length ? <ActivityIndicator size="large" color={theme.colors.primary} /> : null}
      {!loading && !competitions.length && !error ? <View style={styles.card}>
        <Text style={styles.cardTitle}>No awards announced yet</Text>
        <Text style={styles.muted}>Follow this event to discover new competitions as organizers publish them.</Text>
      </View> : null}
      {competitions.map(contest => <View key={contest.id} style={styles.card}>
        <View style={styles.headingRow}>
          <Text style={styles.cardTitle}>{contest.title}</Text>
          <Text style={styles.status}>{contest.status === 'DRAFT' ? 'Draft' : contest.canVote ? 'Voting open' : 'Voting closed or scheduled'}</Text>
        </View>
        {contest.description ? <Text style={styles.muted}>{contest.description}</Text> : null}
        <Text style={styles.muted}>Starts {timeLabel(contest.votingStartsAt)}</Text>
        <Text style={styles.muted}>Ends {timeLabel(contest.votingEndsAt)}</Text>
        <Text style={styles.stat}>{contest.countsVisible ? String(contest.totalVotes ?? 0) + ' verified votes' : 'Public totals are not available yet'}</Text>
        {contest.categories.map(category => <View key={category.id} style={styles.category}>
          <View style={styles.headingRow}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <Text style={styles.muted}>{category.myNomineeId ? 'Your vote recorded' : contest.countsVisible ? String(category.totalVotes ?? 0) + ' votes' : 'Results withheld'}</Text>
          </View>
          {category.nominees.map(nominee => {
            const selected = category.myNomineeId === nominee.id
            const percent = contest.countsVisible && category.totalVotes
              ? Math.round(((nominee.votes ?? 0) / category.totalVotes) * 100) : 0
            return <View key={nominee.id} style={[styles.nominee, selected && styles.selected]}>
              <View style={styles.nomineeRow}>
                {nominee.photoUrl ? <Image style={styles.avatar} source={{ uri: nominee.photoUrl }} /> :
                  <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initial}>{nominee.name.charAt(0).toUpperCase()}</Text></View>}
                <View style={styles.identity}>
                  <Text style={styles.nomineeName}>{nominee.name}</Text>
                  {nominee.bio ? <Text style={styles.muted} numberOfLines={3}>{nominee.bio}</Text> : null}
                </View>
              </View>
              {contest.countsVisible ? <View style={styles.score}>
                <View style={styles.headingRow}>
                  <Text style={styles.muted}>{nominee.votes ?? 0} votes</Text>
                  <Text style={styles.muted}>{percent}%</Text>
                </View>
                <View style={styles.track}><View style={[styles.fill, { width: (String(percent) + '%') as DimensionValue }]} /></View>
              </View> : null}
              <Pressable accessibilityRole="button"
                accessibilityLabel={'Vote free for ' + nominee.name + ' in ' + category.title}
                style={[styles.vote, (busy || !contest.canVote || !!category.myNomineeId) && styles.disabled, selected && styles.voteSelected]}
                disabled={busy || !contest.canVote || Boolean(category.myNomineeId)}
                onPress={() => confirmVote(contest, category, nominee)}>
                <Text style={styles.voteText}>{selected ? '✓ Voted' : 'Vote free'}</Text>
              </Pressable>
            </View>
          })}
        </View>)}
      </View>)}
      {feedback ? <Text style={styles.success} accessibilityRole="alert">{feedback}</Text> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
    <ActionDialog prompt={prompt} busy={busy} onDismiss={() => setPrompt(null)} />
  </View>
}

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor:theme.colors.bg },
  content: { padding:16, paddingBottom:45, gap:14 },
  hero: { padding:20, borderRadius:22, backgroundColor:theme.colors.primaryDark, gap:9 },
  eyebrow: { color:'#96f2c9', fontSize:10, fontWeight:'800', letterSpacing:1.5 },
  title: { color:'#ffffff', fontSize:23, fontWeight:'800' },
  heroText: { color:'#eefef6', fontSize:14, fontWeight:'700' },
  heroNote: { color:'#c2e8d5', fontSize:12, lineHeight:18 },
  security: { backgroundColor:'#e8f7ee', padding:14, borderRadius:14, gap:5 },
  securityTitle: { color:theme.colors.primaryDark, fontSize:14, fontWeight:'800' },
  securityBody: { color:theme.colors.primaryDark, fontSize:12, lineHeight:19 },
  secondary: { minHeight:44, borderRadius:12, borderWidth:1, borderColor:theme.colors.border, alignItems:'center', justifyContent:'center' },
  secondaryLabel: { color:theme.colors.primaryDark, fontSize:13, fontWeight:'800' },
  card: { padding:15, borderRadius:18, backgroundColor:theme.colors.card, borderWidth:1, borderColor:theme.colors.border, gap:11 },
  cardTitle: { color:theme.colors.text, fontWeight:'800', fontSize:16, flex:1 },
  muted: { color:theme.colors.textMuted, fontSize:12, lineHeight:19 },
  headingRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:8 },
  status: { color:theme.colors.primaryDark, fontSize:11, fontWeight:'700', maxWidth:120 },
  stat: { color:theme.colors.primaryDark, fontSize:12, fontWeight:'800' },
  category: { padding:12, gap:10, backgroundColor:'#f4f9f6', borderRadius:13 },
  categoryTitle: { color:theme.colors.text, fontWeight:'800', fontSize:15, flex:1 },
  nominee: { padding:12, borderRadius:12, borderWidth:1, borderColor:theme.colors.border, backgroundColor:'#ffffff', gap:10 },
  selected: { borderColor:theme.colors.primary },
  nomineeRow: { flexDirection:'row', gap:10, alignItems:'center' },
  avatar: { width:48, height:48, borderRadius:10 },
  avatarFallback: { backgroundColor:'#d8f3e3', justifyContent:'center', alignItems:'center' },
  initial: { fontSize:19, color:theme.colors.primaryDark, fontWeight:'800' },
  identity: { flex:1, gap:3 },
  nomineeName: { color:theme.colors.text, fontWeight:'800', fontSize:14 },
  score: { gap:6 },
  track: { height:8, backgroundColor:'#e2ebe5', borderRadius:8, overflow:'hidden' },
  fill: { height:8, backgroundColor:theme.colors.primary, borderRadius:8 },
  vote: { borderRadius:10, minHeight:44, backgroundColor:theme.colors.primary, justifyContent:'center', alignItems:'center' },
  voteSelected: { backgroundColor:theme.colors.primaryDark },
  voteText: { color:'#ffffff', fontSize:13, fontWeight:'800' },
  disabled: { opacity:0.65 },
  success: { backgroundColor:'#e0f8eb', borderRadius:10, padding:12, color:theme.colors.primaryDark, fontSize:13 },
  error: { backgroundColor:'#fff0e5', borderRadius:10, padding:12, color:'#8a3713', fontSize:13 },
})
