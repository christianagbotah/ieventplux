/** Live hub: verified broadcasts from the server, never fabricated live sessions. */
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { api, type DiscoveryHome } from '../api/client'
import { theme } from '../theme'
import type { LiveHubScreenProps } from '../navigation'

type LiveEvent = DiscoveryHome['liveNow'][number]
export default function LiveHubScreen({ navigation }: LiveHubScreenProps) {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      const home = await api.discovery.home()
      setEvents(home.liveNow.filter(row => row.broadcasts.some(b => b.status === 'LIVE')))
      setError('')
    } catch { setError('Live broadcasts could not be refreshed. Check your connection.') }
    finally { setBusy(false); setRefreshing(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const openLive = (event: LiveEvent) => {
    const broadcast = event.broadcasts.find(b => b.status === 'LIVE')
    if (broadcast) navigation.navigate('Broadcast', { broadcastId: broadcast.id })
  }
  return <FlatList
    style={styles.screen} contentContainerStyle={styles.content}
    data={events} keyExtractor={item => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void refresh() }} tintColor={theme.colors.primary} />}
    ListHeaderComponent={<View>
      <View style={styles.hero}>
        <View style={styles.liveRow}><View style={styles.pulse} /><Text style={styles.kicker}>THE LIVE EXPERIENCE</Text></View>
        <Text style={styles.heroTitle}>Be there. From anywhere.</Text>
        <Text style={styles.heroBody}>Discover live programs and watch authorized broadcasts as they happen.</Text>
        <View style={styles.heroBottom}><Text style={styles.liveCount}>{events.length} live now</Text><Text style={styles.liveMeta}>Pull down to refresh</Text></View>
      </View>
      <View style={styles.sectionRow}><Text style={styles.heading}>Live right now</Text><Text style={styles.subheading}>Broadcasts</Text></View>
      {busy ? <ActivityIndicator style={{ padding: 24 }} color={theme.colors.primary} /> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>}
    ListEmptyComponent={!busy ? <View style={styles.empty}>
      <Text style={styles.emptyIcon}>◉</Text>
      <Text style={styles.emptyTitle}>Nothing live right now</Text>
      <Text style={styles.emptyBody}>When organizers go live, broadcasts will appear here. Discover an event to explore meetings and upcoming experiences.</Text>
      <Pressable style={styles.cta} accessibilityRole="button" onPress={() => navigation.navigate('Discover')}><Text style={styles.ctaText}>Explore events</Text></Pressable>
    </View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'Watch live broadcast: ' + item.title} onPress={() => openLive(item)} style={({ pressed }) => [styles.card, pressed && { opacity: .82 }]}>
      <View style={styles.imageWrap}>
        {item.coverImageUrl ? <Image source={{ uri: item.coverImageUrl }} style={styles.image} resizeMode="cover" /> : <Text style={styles.fallback}>iEventPlux LIVE</Text>}
        <View style={styles.badge}><Text style={styles.badgeText}>● LIVE</Text></View>
      </View>
      <View style={styles.cardBody}><Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>{item.org.name} · {item.mode === 'HYBRID' ? 'Hybrid event' : 'Online broadcast'}</Text>
        <View style={styles.actionRow}><Text style={styles.action}>Watch live</Text><Text style={styles.actionArrow}>›</Text></View>
      </View>
    </Pressable>}
  />
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hero: { backgroundColor: '#103b33', padding: 24, borderRadius: 24, marginBottom: 25 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pulse: { height: 8, width: 8, borderRadius: 4, backgroundColor: '#f56a65' },
  kicker: { color: '#c9f4e4', fontWeight: '800', fontSize: 10, letterSpacing: 1.4 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 29, lineHeight: 35, letterSpacing: -.6 },
  heroBody: { color: '#d1e8de', fontSize: 14, lineHeight: 22, marginTop: 10 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  liveCount: { color: '#fff', fontSize: 13, fontWeight: '800' },
  liveMeta: { color: '#b1d3c5', fontSize: 11 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heading: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subheading: { fontSize: 12, color: theme.colors.textMuted },
  error: { padding: 12, color: theme.colors.danger, fontSize: 12 },
  empty: { padding: 26, alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border },
  emptyIcon: { fontSize: 34, color: theme.colors.primary, marginBottom: 12 },
  emptyTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  emptyBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  cta: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, minHeight: 46, justifyContent: 'center', borderRadius: 14, marginTop: 22 },
  ctaText: { fontWeight: '800', color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, marginBottom: 15 },
  imageWrap: { height: 165, backgroundColor: '#0b5645', justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  fallback: { color: '#fff', fontSize: 21, fontWeight: '800' },
  badge: { position: 'absolute', top: 13, left: 13, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, backgroundColor: '#cc2828' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: .5 },
  cardBody: { padding: 17 },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  cardMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 7 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  action: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' },
  actionArrow: { color: theme.colors.primary, fontSize: 24, lineHeight: 25 },
})
