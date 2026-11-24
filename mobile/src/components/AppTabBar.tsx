/** Always-visible, safe-area-aware mobile primary navigation. */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MAIN_TABS, type MainTabRoute } from '../lib/main-tabs'
import { theme } from '../theme'

type IconName = (typeof MAIN_TABS)[number]['icon']

function TabIcon({ name, selected }: { name: IconName; selected: boolean }) {
  const color = selected ? theme.colors.primary : theme.colors.textMuted
  const common = { stroke: color, strokeWidth: 1.85, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return <Svg width={23} height={23} viewBox="0 0 24 24" accessibilityElementsHidden>
    {name === 'compass' ? <>
      <Circle cx="12" cy="12" r="9" {...common} />
      <Path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" {...common} />
    </> : name === 'live' ? <>
      <Circle cx="12" cy="12" r="2" {...common} />
      <Path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15" {...common} />
    </> : name === 'bag' ? <>
      <Rect x="3.5" y="7.5" width="17" height="14" rx="2.4" {...common} />
      <Path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3" {...common} />
    </> : name === 'ticket' ? <>
      <Path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1zM14 5v2M14 10v4M14 17v2" {...common} />
    </> : <>
      <Circle cx="12" cy="8" r="3.5" {...common} />
      <Path d="M5.5 20v-1.6c0-3 2.9-5 6.5-5s6.5 2 6.5 5V20" {...common} />
    </>}
  </Svg>
}

export function AppTabBar({ active, onSelect }: { active: MainTabRoute; onSelect: (route: MainTabRoute) => void }) {
  const insets = useSafeAreaInsets()
  return <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
    {MAIN_TABS.map(tab => {
      const selected = tab.route === active
      return <Pressable key={tab.route} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected }} onPress={() => onSelect(tab.route)}
        style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
        <View style={[styles.iconBox, selected && styles.selectedIcon]}>
          <TabIcon name={tab.icon} selected={selected} />
        </View>
        <Text allowFontScaling numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
      </Pressable>
    })}
  </View>
}

const styles = StyleSheet.create({
  outer: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.border,
    paddingTop: 6, paddingHorizontal: 5, elevation: 10, shadowColor: '#17362a', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: -3 } },
  tab: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2 },
  iconBox: { height: 31, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  selectedIcon: { backgroundColor: '#e3f6ed' },
  label: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted },
  selectedLabel: { color: theme.colors.primaryDark, fontWeight: '800' },
  pressed: { opacity: 0.7 },
})
