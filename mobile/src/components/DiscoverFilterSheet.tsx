/** Professional accessible native counterpart of the web Discover filter drawer. */
import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ACCESS_OPTIONS, countryName, DATE_WINDOWS, EMPTY_DISCOVERY_FILTERS,
  PRICE_OPTIONS, type DiscoveryFilters,
} from '../lib/discovery-filters'
import { theme } from '../theme'

type Option = { value: string; label: string }
function ChoiceGroup({ title, options, selected, onSelect }: {
  title: string; options: Option[]; selected: string; onSelect: (value: string) => void
}) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.options}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="button"
        accessibilityState={{selected: selected === option.value}} accessibilityLabel={option.label}
        style={({pressed}) => [styles.chip,selected === option.value && styles.activeChip, pressed && styles.pressed]}
        onPress={() => onSelect(option.value)}>
        <Text style={[styles.chipText,selected === option.value && styles.activeChipText]}>{option.label}</Text>
      </Pressable>)}
    </View>
  </View>
}

export function DiscoverFilterSheet({ visible, filters, categories, countries, onApply, onClose }: {
  visible: boolean
  filters: DiscoveryFilters
  categories: { slug: string; name: string }[]
  countries: { code: string; count: number }[]
  onApply: (filters: DiscoveryFilters) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const {height,width,fontScale} = useWindowDimensions()
  const stackActions=fontScale>=1.3||width<360
  const [draft, setDraft] = useState<DiscoveryFilters>(filters)
  const [countrySearch, setCountrySearch] = useState('')
  useEffect(() => { if (visible) {setDraft(filters);setCountrySearch('')} }, [visible,filters])
  const options = useMemo(() => {
    const q = countrySearch.trim().toLowerCase()
    return countries.filter(item => !q || item.code.toLowerCase().includes(q) || countryName(item.code).toLowerCase().includes(q)).slice(0,16)
  }, [countries,countrySearch])
  const set = (key: keyof DiscoveryFilters, value: string) => setDraft(current => ({...current,[key]:value}))
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close event filters" />
      <View style={[styles.sheet,{maxHeight:Math.max(350,height-60),paddingBottom:Math.max(insets.bottom,13)}]}>
        <View style={styles.handle} />
        <View style={styles.heading}>
          <View style={{flex:1}}><Text style={styles.eyebrow}>FIND YOUR NEXT EXPERIENCE</Text><Text style={styles.title}>Discover filters</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <ChoiceGroup title="When" options={DATE_WINDOWS} selected={draft.when} onSelect={value=>set('when',value)}/>
          <ChoiceGroup title="Access" options={ACCESS_OPTIONS} selected={draft.mode} onSelect={value=>set('mode',value)}/>
          <ChoiceGroup title="Entry" options={PRICE_OPTIONS} selected={draft.price} onSelect={value=>set('price',value)}/>
          <ChoiceGroup title="Category" options={[{value:'',label:'All categories'},...categories.map(c=>({value:c.slug,label:c.name}))]} selected={draft.category} onSelect={value=>set('category',value)}/>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Country</Text>
            <View style={styles.options}>
              <Pressable accessibilityRole="button" accessibilityState={{selected: !draft.country}} style={[styles.chip,!draft.country && styles.activeChip]} onPress={()=>set('country','')}><Text style={[styles.chipText,!draft.country && styles.activeChipText]}>All countries</Text></Pressable>
              {draft.country ? <Pressable accessibilityRole="button" style={styles.chip} onPress={()=>set('country','')}><Text style={styles.chipText}>✓ {countryName(draft.country)} · clear</Text></Pressable> : null}
            </View>
            {countries.length ? <>
              <TextInput style={styles.input} value={countrySearch} onChangeText={setCountrySearch} placeholder="Find a country" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search countries" autoCorrect={false}/>
              <View style={styles.options}>{options.map(item=><Pressable key={item.code} accessibilityRole="button" accessibilityLabel={countryName(item.code)} accessibilityState={{selected:draft.country===item.code}}
                style={[styles.chip,draft.country===item.code && styles.activeChip]} onPress={()=>set('country',item.code)}>
                <Text style={[styles.chipText,draft.country===item.code && styles.activeChipText]}>{countryName(item.code)}</Text>
              </Pressable>)}</View>
              {countrySearch && !options.length ? <Text style={styles.note}>No countries match this search.</Text> : null}
            </> : <Text style={styles.note}>Country suggestions are unavailable. You can still use the other filters.</Text>}
          </View>
          <View style={styles.group}><Text style={styles.groupTitle}>City</Text>
            <TextInput value={draft.city} onChangeText={value=>set('city',value)} placeholder="Any city" placeholderTextColor={theme.colors.textMuted} style={styles.input} accessibilityLabel="Filter by city" autoCapitalize="words"/>
          </View>
        </ScrollView>
        <View style={[styles.footer,stackActions&&styles.footerStacked]}>
          <Pressable accessibilityRole="button" style={styles.clear} onPress={()=>setDraft({...EMPTY_DISCOVERY_FILTERS})}><Text style={styles.clearText}>Clear all</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.apply} onPress={()=>onApply(draft)}><Text style={styles.applyText}>Show events  →</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}
const styles=StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end'},backdrop:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(9,23,31,.57)'},
  sheet:{width:'100%',backgroundColor:theme.colors.card,borderTopLeftRadius:25,borderTopRightRadius:25,paddingHorizontal:18},
  handle:{width:42,height:5,backgroundColor:'#ccd8de',borderRadius:5,alignSelf:'center',marginTop:9,marginBottom:17},
  heading:{flexDirection:'row',gap:12,alignItems:'center',paddingBottom:14,borderBottomWidth:1,borderBottomColor:theme.colors.border},
  eyebrow:{fontSize:13,color:theme.colors.primary,fontWeight:'900',letterSpacing:1.1},title:{fontSize:24,fontWeight:'900',color:theme.colors.text,marginTop:5},
  close:{width:48,height:48,borderRadius:15,backgroundColor:theme.colors.bg,alignItems:'center',justifyContent:'center'},closeText:{fontSize:26,color:theme.colors.text},
  scroll:{flexShrink:1},content:{paddingBottom:26,paddingTop:14},group:{marginBottom:21},groupTitle:{fontSize:16,fontWeight:'900',color:theme.colors.text,marginBottom:11},
  options:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:48,borderRadius:14,paddingHorizontal:13,paddingVertical:10,backgroundColor:theme.colors.bg,borderWidth:1,borderColor:theme.colors.border,justifyContent:'center'},activeChip:{backgroundColor:theme.web.tealSoft,borderColor:theme.colors.primary},
  chipText:{fontSize:14,fontWeight:'700',color:theme.colors.textMuted},activeChipText:{color:theme.colors.primary},pressed:{opacity:.75},
  input:{borderWidth:1,borderColor:theme.colors.border,borderRadius:13,minHeight:48,paddingHorizontal:14,fontSize:16,color:theme.colors.text,backgroundColor:'#fff',marginBottom:10},
  note:{fontSize:14,color:theme.colors.textMuted,lineHeight:21,marginTop:9},
  footer:{borderTopWidth:1,borderTopColor:theme.colors.border,flexDirection:'row',gap:10,paddingTop:14},
  footerStacked:{flexDirection:'column'},
  clear:{minHeight:49,flex:1,backgroundColor:theme.colors.bg,borderRadius:13,alignItems:'center',justifyContent:'center'},clearText:{fontSize:16,fontWeight:'700',color:theme.colors.text},
  apply:{minHeight:49,flex:2,backgroundColor:theme.colors.primary,borderRadius:13,alignItems:'center',justifyContent:'center'},applyText:{fontWeight:'700',fontSize:16,color:'#fff'},
})
