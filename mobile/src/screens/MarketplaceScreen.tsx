/** Native customer storefront discovery — same server-visible sellers as web. */
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { api, ApiClientError, type NativeMarketplaceStore } from '../api/client'
import { theme } from '../theme'
import type { MarketplaceScreenProps } from '../navigation'

export default function MarketplaceScreen({ navigation }: MarketplaceScreenProps) {
  const [stores, setStores] = useState<NativeMarketplaceStore[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async(q: string) => {
    try {
      const result = await api.marketplace.stores(q)
      setStores(result.stores)
      setError('')
    } catch (reason) {
      setStores([])
      setError(reason instanceof ApiClientError ? reason.message : 'Cannot load stores right now.')
    } finally { setLoading(false); setRefreshing(false) }
  }, [])
  useEffect(() => { void load('') }, [load])

  return <FlatList
    style={styles.screen}
    contentContainerStyle={styles.content}
    data={stores}
    keyExtractor={row=>row.id}
    refreshControl={<RefreshControl refreshing={refreshing}
      tintColor={theme.colors.primary}
      onRefresh={()=>{setRefreshing(true);void load(search.trim())}} />}
    ListHeaderComponent={<View style={styles.header}>
      <Text style={styles.eyebrow}>CREATORS • MERCHANTS • SERVICES</Text>
      <Text style={styles.title}>Discover local stores, anytime.</Text>
      <Text style={styles.subtitle}>Browse real seller catalogues with detailed descriptions, prices and available stock. Businesses can showcase products beyond any one event.</Text>
      <View style={styles.searchRow}>
        <TextInput style={styles.search} value={search} onChangeText={setSearch}
          placeholder="Find stores or categories" placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Search store names or categories" returnKeyType="search"
          onSubmitEditing={()=>void load(search.trim())} />
        <Pressable style={styles.find} accessibilityRole="button" onPress={()=>void load(search.trim())}>
          <Text style={styles.findText}>Find</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>Store verification is shown only when confirmed. Purchasing and delivery are not yet enabled for these independent stores.</Text>
      {loading ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>}
    ListEmptyComponent={!loading ? <View style={styles.empty}>
      <Text style={styles.cardTitle}>No matching stores</Text>
      <Text style={styles.muted}>Sellers will appear here as they publish their storefronts.</Text>
    </View> : null}
    renderItem={({item})=><Pressable style={styles.card} accessibilityRole="button"
      accessibilityLabel={'Open ' + item.name + ' storefront'}
      onPress={()=>navigation.navigate('MarketplaceStore',{slug:item.slug})}>
      <View style={styles.banner}>
        {item.coverUrl ? <Image source={{uri:item.coverUrl}} style={styles.cover} /> : null}
        {item.logoUrl ? <Image source={{uri:item.logoUrl}} style={styles.logo} /> : <Text style={styles.storeEmoji}>🛍</Text>}
      </View>
      <View style={styles.body}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {item.tagline ? <Text style={styles.muted} numberOfLines={2}>{item.tagline}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{item.category}</Text>
          <Text style={styles.meta}>{[item.city,item.country].filter(Boolean).join(', ')}</Text>
        </View>
        {item.verificationState==='VERIFIED' ? <Text style={styles.verified}>✓ Verified seller</Text> : <Text style={styles.muted}>Independent seller</Text>}
      </View>
    </Pressable>}
  />
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},
  content:{padding:16,paddingBottom:50,gap:14},
  header:{padding:20,borderRadius:22,backgroundColor:theme.colors.primaryDark,gap:10,marginBottom:8},
  eyebrow:{fontSize:10,letterSpacing:1.4,fontWeight:'800',color:'#a5ecc6'},
  title:{fontSize:23,fontWeight:'800',color:'#fff'},
  subtitle:{fontSize:12,lineHeight:20,color:'#d7f2e5'},
  searchRow:{flexDirection:'row',gap:8,marginTop:7},
  search:{flex:1,minHeight:46,backgroundColor:'#fff',paddingHorizontal:13,borderRadius:12,fontSize:13,color:theme.colors.text},
  find:{paddingHorizontal:16,borderRadius:11,backgroundColor:'#bcf7d3',justifyContent:'center',alignItems:'center'},
  findText:{fontSize:13,fontWeight:'800',color:theme.colors.primaryDark},
  note:{fontSize:11,lineHeight:17,color:'#c9ecdb'},
  loader:{padding:12},
  error:{backgroundColor:'#ffecdb',color:'#74391f',padding:10,borderRadius:9,fontSize:12},
  empty:{alignItems:'center',padding:26,borderWidth:1,borderColor:theme.colors.border,borderRadius:17},
  card:{backgroundColor:theme.colors.card,borderWidth:1,borderColor:theme.colors.border,borderRadius:19,overflow:'hidden',marginBottom:12},
  banner:{height:95,backgroundColor:theme.colors.primaryDark,justifyContent:'center',alignItems:'center'},
  cover:{position:'absolute',width:'100%',height:'100%',opacity:0.7},
  logo:{height:54,width:54,borderRadius:12,borderWidth:2,borderColor:'#fff',backgroundColor:'#fff'},
  storeEmoji:{fontSize:35},
  body:{padding:15,gap:7},
  cardTitle:{fontSize:17,color:theme.colors.text,fontWeight:'800'},
  muted:{fontSize:12,color:theme.colors.textMuted,lineHeight:19},
  metaRow:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'space-between'},
  meta:{fontSize:11,color:theme.colors.primaryDark,fontWeight:'700'},
  verified:{fontSize:11,color:theme.colors.primary,fontWeight:'800'},
})
