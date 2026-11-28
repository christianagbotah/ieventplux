/** Always-visible, safe-area-aware mobile primary navigation. */
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
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
    </> : name === 'users' ? <>
      <Circle cx="9" cy="8" r="3" {...common} />
      <Path d="M3 20v-1.5c0-3 2.5-5 6-5s6 2 6 5V20M16 5.5a3 3 0 0 1 0 5.5M18 14c2.3.5 3 2.2 3 4.5V20" {...common} />
    </> : name === 'plus' ? <Path d="M12 5v14M5 12h14" {...common} stroke="#fff" strokeWidth={2.4} /> : name === 'bag' ? <>
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
  const {fontScale,width}=useWindowDimensions()
  const expanded=fontScale>=1.4||width<310
  return <View style={[styles.outer, expanded&&styles.outerExpanded, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
    {MAIN_TABS.map(tab => {
      const selected = tab.route === active
      return <Pressable key={tab.route} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected }} onPress={() => onSelect(tab.route)}
        style={({ pressed }) => [styles.tab, expanded&&styles.tabExpanded, pressed && styles.pressed]}>
        <View style={[styles.iconBox, selected && styles.selectedIcon,tab.route==='CreateHub'&&styles.createIcon]}>
          <TabIcon name={tab.icon} selected={selected} />
        </View>
        <Text allowFontScaling style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
        <View style={[styles.indicator,selected&&styles.indicatorActive]}/>
      </Pressable>
    })}
  </View>
}

const styles = StyleSheet.create({
  outer: {
    flexDirection:'row',alignItems:'center',backgroundColor:'#ffffff',
    borderRadius:16,borderWidth:1,borderColor:theme.colors.border,
    paddingTop:4,paddingHorizontal:4,marginHorizontal:8,marginTop:3,marginBottom:2,
    elevation:4,shadowColor:'#102f36',shadowOpacity:.06,shadowRadius:22,shadowOffset:{width:0,height:-3},
  },
  outerExpanded:{flexWrap:'wrap'},
  tabExpanded:{flex:0,width:'33.333%'},
  tab:{flex:1,minHeight:54,alignItems:'center',justifyContent:'center',gap:2,paddingHorizontal:1},
  iconBox:{height:29,minWidth:36,alignItems:'center',justifyContent:'center',borderRadius:14},
  selectedIcon:{backgroundColor:'#e4f5ee'},
  createIcon:{backgroundColor:theme.colors.primary,minWidth:42,height:33,borderRadius:12},
  label:{fontSize:11,lineHeight:15,textAlign:'center',fontWeight:'600',color:theme.colors.textMuted,letterSpacing:-.1},
  selectedLabel:{color:theme.colors.primaryDark,fontWeight:'700'},
  indicator:{height:3,width:13,borderRadius:2,backgroundColor:'transparent',marginTop:2},
  indicatorActive:{backgroundColor:theme.colors.primary},
  pressed:{opacity:.68},
})
