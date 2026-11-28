/** Native premium marketplace discovery; all seller data is from the live server. */
import {useCallback,useEffect,useRef,useState} from 'react'
import {ActivityIndicator,FlatList,Image,Pressable,RefreshControl,StyleSheet,Text,TextInput,View} from 'react-native'
import {absoluteUrl,api,ApiClientError,type NativeMarketplaceStore} from '../api/client'
import {PremiumBackdrop,LabelPill,SectionHeading,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import {theme} from '../theme'
import type {MarketplaceScreenProps} from '../navigation'

export default function MarketplaceScreen({navigation}:MarketplaceScreenProps){
  const [stores,setStores]=useState<NativeMarketplaceStore[]>([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const revision=useRef(0)
  const load=useCallback(async(query:string)=>{
    const current=++revision.current
    setLoading(true)
    try{
      const result=await api.marketplace.stores(query)
      if(current!==revision.current)return
      setStores(result.stores);setError('')
    }catch(reason){
      if(current!==revision.current)return
      setError(reason instanceof ApiClientError?reason.message:'Cannot load stores right now.')
    }finally{if(current===revision.current){setLoading(false);setRefreshing(false)}}
  },[])
  useEffect(()=>{void load('')},[load])
  const header=<View>
    <View style={styles.hero}>
      <PremiumBackdrop mode="ocean"/>
      <View style={styles.kickerRow}><Text style={styles.kicker}>THE iEVENTPLUX MARKETPLACE</Text><Text style={styles.kickerBadge}>✦</Text></View>
      <Text style={styles.heroTitle}>Discover brands.{"\n"}<Text style={styles.heroAccent}>Shop inspired.</Text></Text>
      <Text style={styles.heroDescription}>Meet creators, explore independent storefronts and discover products and services from real sellers.</Text>
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput style={styles.search} value={search} onChangeText={setSearch}
          placeholder="Search stores or categories" placeholderTextColor={mobileDesign.inkSoft}
          accessibilityLabel="Search store names or categories" returnKeyType="search"
          onSubmitEditing={()=>void load(search.trim())}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Search marketplace" style={styles.find} onPress={()=>void load(search.trim())}>
          <Text style={styles.findText}>Find  ↗</Text>
        </Pressable>
      </View>
    </View>
    <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('SellerStudio')} style={[styles.advisory,{marginBottom:12}]}><TileGlyph kind="store" size={40}/><View style={{flex:1}}><Text style={{fontSize:16,fontWeight:'700',color:mobileDesign.ink}}>Sell on iEventPlux</Text><Text style={styles.advisoryText}>Create or manage your store  ›</Text></View></Pressable>
    <View style={styles.advisory}><Text style={styles.advisoryIcon}>ⓘ</Text><Text style={styles.advisoryText}>Independent storefront discovery is available. Online checkout and delivery are not yet enabled for these stores.</Text></View>
    <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('Services')} style={styles.advisory}><Text style={styles.advisoryText}>Find local services or register as a service provider  →</Text></Pressable>
    <SectionHeading eyebrow="OUR COMMUNITY OF SELLERS" title="Explore storefronts"
      subtitle={loading?'Finding published sellers…':`${stores.length} ${stores.length===1?'store':'stores'} in this view`}/>
    {loading?<ActivityIndicator color={theme.colors.primary} style={styles.loader}/>:null}
    {error?<View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable accessibilityRole="button" style={styles.tryAgain} onPress={()=>void load(search.trim())}><Text style={styles.tryAgainText}>Try again  ↗</Text></Pressable></View>:null}
  </View>
  return <FlatList style={styles.screen} contentContainerStyle={styles.content}
    data={stores} keyExtractor={item=>item.id} ListHeaderComponent={header}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.primary}
      onRefresh={()=>{setRefreshing(true);void load(search.trim())}}/>}
    ListEmptyComponent={!loading&&!error?<View style={styles.empty}>
      <TileGlyph kind="store" size={68}/>
      <Text style={styles.emptyTitle}>No matching storefronts yet</Text>
      <Text style={styles.emptyBody}>New independent sellers will appear here when they publish their stores.</Text>
      {search?<Pressable accessibilityRole="button" style={styles.clearSearch} onPress={()=>{setSearch('');void load('')}}>
        <Text style={styles.clearText}>Clear search</Text>
      </Pressable>:null}
    </View>:null}
    renderItem={({item})=><StoreCard item={item} onPress={()=>navigation.navigate('MarketplaceStore',{slug:item.slug})}/>}
  />
}
function StoreCard({item,onPress}:{item:NativeMarketplaceStore;onPress:()=>void}){
  const cover=item.coverUrl?absoluteUrl(item.coverUrl):null
  const logo=item.logoUrl?absoluteUrl(item.logoUrl):null
  return <Pressable accessibilityRole="button" accessibilityLabel={'Explore '+item.name+' storefront'} onPress={onPress}
    style={({pressed})=>[styles.card,pressed&&{opacity:.82}]}>
    <View style={styles.banner}>
      <PremiumBackdrop mode="midnight"/>
      {cover?<Image source={{uri:cover}} style={styles.cover} resizeMode="cover" accessibilityLabel={item.name+' banner'}/>:null}
      <View style={styles.bannerChip}><Text style={styles.bannerChipText}>EXPLORE THE STORE</Text></View>
      <View style={styles.brandLogo}>
        {logo?<Image source={{uri:logo}} style={styles.logo} accessibilityLabel={item.name+' logo'}/>:<TileGlyph kind="store" size={52}/>}
      </View>
    </View>
    <View style={styles.body}>
      <View style={styles.titleRow}><View style={{flex:1}}><Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
        {item.tagline?<Text style={styles.tagline} numberOfLines={2}>{item.tagline}</Text>:null}</View>
        <View style={styles.arrowBox}><Text style={styles.arrowText}>↗</Text></View>
      </View>
      <View style={styles.metaRow}>
        <LabelPill label={item.category||'Independent store'} tone="light"/>
        {item.verificationState==='VERIFIED'?<LabelPill label="✓ Verified"/>:null}
      </View>
      {[item.city,item.country].filter(Boolean).length?<Text style={styles.location}>⌖  {[item.city,item.country].filter(Boolean).join(', ')}</Text>:null}
      <View style={styles.cardFooter}><Text style={styles.cardFooterText}>Visit storefront</Text><Text style={styles.cardFooterArrow}>→</Text></View>
    </View>
  </Pressable>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,paddingBottom:42},
  hero:{backgroundColor:mobileDesign.forest,borderRadius:29,overflow:'hidden',paddingHorizontal:22,paddingTop:24,paddingBottom:23,marginBottom:16,
    shadowColor:mobileDesign.forest,shadowOpacity:.22,shadowRadius:19,shadowOffset:{width:0,height:11},elevation:6},
  kickerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#ccf5e6'},kickerBadge:{fontSize:22,color:'#f5dbac'},
  heroTitle:{fontSize:31,fontWeight:'900',letterSpacing:-1.15,lineHeight:38,color:'#fff',marginTop:21},
  heroAccent:{color:'#c6f6dd'},heroDescription:{color:'#e4f2ef',fontSize:13,lineHeight:21,marginTop:12,maxWidth:340},
  searchRow:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:17,backgroundColor:'#fff',paddingHorizontal:12,marginTop:23,minHeight:54},
  searchIcon:{fontSize:27,color:mobileDesign.emerald},search:{flex:1,color:mobileDesign.ink,fontSize:13,minHeight:49},
  find:{backgroundColor:mobileDesign.emerald,alignItems:'center',justifyContent:'center',borderRadius:12,paddingHorizontal:15,minHeight:39},
  findText:{color:'#fff',fontSize:12,fontWeight:'900'},
  advisory:{flexDirection:'row',gap:10,borderRadius:16,backgroundColor:mobileDesign.mintSoft,padding:13,marginBottom:25,alignItems:'flex-start'},
  advisoryIcon:{color:mobileDesign.emerald,fontWeight:'900',fontSize:17},
  advisoryText:{flex:1,color:'#3b655c',fontSize:11,lineHeight:18},loader:{margin:16},
  errorBox:{backgroundColor:'#fff4f0',borderRadius:13,padding:13,gap:9,marginBottom:12},error:{fontSize:12,color:theme.colors.danger},
  tryAgain:{alignSelf:'flex-start',minHeight:36,justifyContent:'center'},tryAgainText:{color:mobileDesign.emerald,fontWeight:'900'},
  empty:{alignItems:'center',backgroundColor:'#fff',padding:24,borderRadius:23,borderWidth:1,borderColor:mobileDesign.border,gap:11},
  emptyTitle:{fontSize:18,fontWeight:'900',color:mobileDesign.ink,textAlign:'center'},
  emptyBody:{fontSize:12,lineHeight:20,color:mobileDesign.inkMuted,textAlign:'center'},
  clearSearch:{backgroundColor:mobileDesign.emerald,padding:13,paddingHorizontal:22,borderRadius:13,marginTop:6},clearText:{color:'#fff',fontWeight:'800'},
  card:{backgroundColor:'#fff',borderRadius:24,borderColor:mobileDesign.border,borderWidth:1,overflow:'hidden',marginBottom:18,
    elevation:3,shadowColor:mobileDesign.shadow,shadowOpacity:.07,shadowRadius:15,shadowOffset:{width:0,height:9}},
  banner:{height:158,backgroundColor:mobileDesign.forestDeep},cover:{position:'absolute',height:'100%',width:'100%',opacity:.88},
  bannerChip:{alignSelf:'flex-start',margin:15,backgroundColor:'#0e263ca6',paddingVertical:8,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:'#ffffff55'},
  bannerChipText:{fontSize:9,letterSpacing:.8,color:'#fff',fontWeight:'900'},
  brandLogo:{position:'absolute',bottom:11,left:16,height:62,width:62,borderRadius:17,backgroundColor:'#fff',borderWidth:3,borderColor:'#ffffffbb',overflow:'hidden',alignItems:'center',justifyContent:'center'},
  logo:{height:'100%',width:'100%'},body:{padding:17},titleRow:{flexDirection:'row',gap:10,alignItems:'center'},
  cardTitle:{fontSize:19,color:mobileDesign.ink,fontWeight:'900',letterSpacing:-.55},
  tagline:{fontSize:12,color:mobileDesign.inkMuted,lineHeight:19,marginTop:5},
  arrowBox:{height:40,width:40,borderRadius:13,backgroundColor:mobileDesign.mintSoft,justifyContent:'center',alignItems:'center'},
  arrowText:{color:mobileDesign.emerald,fontSize:22,fontWeight:'800'},
  metaRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:13},location:{fontSize:11,color:mobileDesign.inkMuted,marginTop:13},
  cardFooter:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:15,paddingTop:12,borderTopWidth:1,borderTopColor:mobileDesign.border},
  cardFooterText:{fontSize:12,fontWeight:'900',color:mobileDesign.emerald},cardFooterArrow:{fontSize:18,color:mobileDesign.emerald},
})
