/** Honest native account hub — route existing features, do not present web-only tools as native. */
import { useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { clearTicketWallet } from '../lib/ticket-wallet'
import { useSession } from '../store/session'
import { theme } from '../theme'
import type { AccountScreenProps } from '../navigation'

export default function AccountScreen({ navigation }: AccountScreenProps) {
  const { user, memberships, signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const [linkError, setLinkError] = useState('')
  const initials = (user?.displayName || user?.email || 'U').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')
  const openPortal = async (path: string) => {
    try { setLinkError(''); await Linking.openURL('https://ieventplux.lightworldtech.com' + path) }
    catch { setLinkError('Unable to open the web portal on this device.') }
  }
  const logout = async () => {
    if (busy) return
    setBusy(true)
    try {
      await clearTicketWallet()
      await signOut()
      navigation.reset({ index: 0, routes: [{ name: 'Discover' }] })
    } finally { setBusy(false) }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.profile}>
      <View style={styles.avatar}>{user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.initials}>{initials}</Text>}</View>
      <Text style={styles.name}>{user?.displayName || 'iEventPlux member'}</Text>
      <Text style={styles.email}>{user?.email || 'Signed-in member'}</Text>
      <View style={styles.role}><Text style={styles.roleText}>{memberships.length} organization{memberships.length === 1 ? '' : 's'} connected</Text></View>
    </View>
    <Text style={styles.sectionLabel}>YOUR EXPERIENCE</Text>
    <View style={styles.group}>
      <Row title="My tickets & orders" detail="Your passes, purchases and offline QR codes" icon="▣" onPress={() => navigation.navigate('MyTickets')} />
      <Row title="Explore events" detail="Find gatherings and communities" icon="✦" onPress={() => navigation.navigate('Discover')} />
      <Row title="Event check-in" detail="Scan QR tickets at the venue" icon="▦" onPress={() => navigation.navigate('Checkin')} last />
    </View>
    <Text style={styles.sectionLabel}>ORGANIZER & ACCOUNT TOOLS</Text>
    <View style={styles.group}>
      <Row title="Organizer studio" detail="Create and manage events in the web portal" icon="◎" onPress={() => void openPortal('/organizer')} />
      <Row title="Profile & settings" detail="Manage your account in the web portal" icon="⚙" onPress={() => void openPortal('/')} last />
    </View>
    {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
    <Pressable style={styles.signOut} disabled={busy} accessibilityRole="button" accessibilityLabel="Sign out of iEventPlux" onPress={() => void logout()}>
      {busy ? <ActivityIndicator color={theme.colors.danger} /> : <Text style={styles.signOutText}>Sign out</Text>}
    </Pressable>
    <Text style={styles.footer}>iEventPlux • Powered by Lightworld Technologies</Text>
  </ScrollView>
}

function Row({ title, detail, icon, last, onPress }: { title: string; detail: string; icon: string; last?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: .7 }]}>
    <View style={styles.rowIcon}><Text style={styles.rowIconText}>{icon}</Text></View>
    <View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 35 },
  profile: { backgroundColor: '#0d4d3d', borderRadius: 23, padding: 25, alignItems: 'center', marginBottom: 26 },
  avatar: { width: 74, height: 74, backgroundColor: '#dcf7e8', borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  initials: { color: theme.colors.primaryDark, fontSize: 25, fontWeight: '800' },
  name: { color: '#fff', fontSize: 23, fontWeight: '800', textAlign: 'center' },
  email: { color: '#c8e7d7', fontSize: 13, marginTop: 5, textAlign: 'center' },
  role: { backgroundColor: '#ffffff24', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12, marginTop: 15 },
  roleText: { color: '#e2f4eb', fontSize: 11, fontWeight: '700' },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 1.2, marginBottom: 11, marginLeft: 5 },
  group: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, marginBottom: 25 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12, minHeight: 72 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#eff4f1' },
  rowIcon: { backgroundColor: '#e9f6ef', width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  rowIconText: { color: theme.colors.primaryDark, fontSize: 19, fontWeight: '700' },
  rowText: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },
  rowDetail: { color: theme.colors.textMuted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  chevron: { color: theme.colors.textMuted, fontSize: 26 },
  signOut: { minHeight: 50, borderWidth: 1, borderColor: '#f0cccc', borderRadius: 15, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  signOutText: { fontWeight: '800', color: theme.colors.danger, fontSize: 14 },
  error: { color: theme.colors.danger, fontSize: 12, marginBottom: 12 },
  footer: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 11, marginTop: 23 },
})
