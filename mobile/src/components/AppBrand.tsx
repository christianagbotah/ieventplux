/** Same ticket mark and split iEvent/Plux wordmark as the web application bar. */
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { theme } from '../theme'

export function AppBrand({ inverted = false }: { inverted?: boolean }) {
  return <View style={styles.row} accessibilityLabel="iEventPlux">
    <View style={styles.icon}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1zM14 5v2M14 10v4M14 17v2"
          stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
    <Text style={[styles.word, inverted && styles.inverted]}>iEvent<Text style={[styles.accent, inverted && styles.invertedAccent]}>Plux</Text></Text>
  </View>
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { width: 32, height: 32, backgroundColor: theme.web.brandMark, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: 18, color: theme.colors.text, fontWeight: '900', letterSpacing: -.65 },
  accent: { color: theme.colors.primary },
  inverted: { color: '#ffffff' },
  invertedAccent: { color: '#b2e7d5' },
})
