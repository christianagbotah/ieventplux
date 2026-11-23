/**
 * Native product catalogue with real server SKU/stock. No hosted payment
 * fallback: merchant checkout remains disabled until certified settlement.
 */
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api, ApiClientError, type NativeStoreDetail } from '../api/client'
import { theme } from '../theme'
import type { MarketplaceStoreScreenProps } from '../navigation'

const cedis=(minor:number)=>'₵'+(minor/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})
export default function MarketplaceStoreScreen({route}:MarketplaceStoreScreenProps){
  const {slug}=route.params
  const [detail,setDetail]=useState<NativeStoreDetail|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    setLoading(true)
    try{
      setDetail(await api.marketplace.store(slug))
      setError('')
    }catch(cause){
      setDetail(null)
      setError(cause instanceof ApiClientError?cause.message:'Cannot load storefront.')
    }finally{setLoading(false)}
  },[slug])
  useEffect(()=>{void load()},[load])
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    {loading&&!detail?<ActivityIndicator size="large" color={theme.colors.primary}/>:null}
    {error?<Text style={styles.error} accessibilityRole="alert">{error}</Text>:null}
    {detail?<><View style={styles.hero}>
      {detail.store.logoUrl?<Image source={{uri:detail.store.logoUrl}} style={styles.shopLogo}/>:<Text style={styles.shopLogoFallback}>🛍</Text>}
      <Text style={styles.title}>{detail.store.name}</Text>
      {detail.store.tagline?<Text style={styles.heroText}>{detail.store.tagline}</Text>:null}
      <Text style={styles.heroText}>{[detail.store.city,detail.store.country].filter(Boolean).join(', ')} · {detail.store.category}</Text>
      {detail.store.verificationState==='VERIFIED'?<Text style={styles.verified}>✓ Verified seller</Text>:<Text style={styles.heroText}>Independent seller · Not platform verified</Text>}
    </View>
      {detail.store.description?<Text style={styles.paragraph}>{detail.store.description}</Text>:null}
      <View style={styles.banner}><Text style={styles.bannerTitle}>Products & inventory</Text>
        <Text style={styles.bannerText}>Product prices and availability come directly from the seller's live catalogue. Online checkout is not enabled yet.</Text>
      </View>
      {detail.products.length===0?<View style={styles.empty}>
        <Text style={styles.productName}>This store has no published products yet</Text>
        <Text style={styles.muted}>Browse again as the seller publishes more items.</Text>
      </View>:detail.products.map(item=><View key={item.id} style={styles.card}>
        {item.images[0]?<Image source={{uri:item.images[0]}} style={styles.productImage}/>:<View style={styles.productPlaceholder}><Text style={styles.placeholderIcon}>📦</Text></View>}
        <View style={styles.cardBody}>
          <Text style={styles.meta}>{item.category}</Text>
          <Text style={styles.productName}>{item.name}</Text>
          {item.brand?<Text style={styles.muted}>{item.brand}</Text>:null}
          <Text style={styles.paragraph}>{item.description}</Text>
          {Object.keys(item.specifications).length>0?<View style={styles.specs}>
            {Object.entries(item.specifications).map(([key,value])=><View key={key} style={styles.specRow}>
              <Text style={styles.muted}>{key}</Text><Text style={styles.specValue}>{value}</Text>
            </View>)}
          </View>:null}
          {item.variants.map(variant=><View key={variant.id} style={styles.variant}>
            <Text style={styles.productName}>{variant.title}</Text>
            <Text style={styles.price}>{cedis(variant.priceMinor)}</Text>
            <Text style={styles.muted}>SKU {variant.sku} · {variant.available} available</Text>
          </View>)}
          <Pressable accessibilityRole="button" disabled style={styles.disabledCheckout}>
            <Text style={styles.disabledCheckoutText}>Checkout and delivery coming later</Text>
          </Pressable>
        </View>
      </View>)}
    </>:null}
    <Pressable onPress={()=>void load()} style={styles.reload} accessibilityRole="button">
      <Text style={styles.reloadText}>Refresh catalogue</Text>
    </Pressable>
  </ScrollView>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},
  content:{padding:16,paddingBottom:50,gap:14},
  hero:{padding:20,backgroundColor:theme.colors.primaryDark,borderRadius:20,alignItems:'center',gap:8},
  shopLogo:{height:60,width:60,borderRadius:13,backgroundColor:'#fff'},
  shopLogoFallback:{fontSize:35},
  title:{color:'#fff',fontSize:21,fontWeight:'800',textAlign:'center'},
  heroText:{color:'#cceada',fontSize:12,textAlign:'center',lineHeight:18},
  verified:{color:'#91f8ba',fontWeight:'800',fontSize:12},
  paragraph:{color:theme.colors.text,fontSize:13,lineHeight:21},
  banner:{borderRadius:13,backgroundColor:'#e3f5e9',padding:14,gap:7},
  bannerTitle:{color:theme.colors.primaryDark,fontWeight:'800',fontSize:15},
  bannerText:{color:theme.colors.primaryDark,fontSize:12,lineHeight:19},
  empty:{padding:22,borderRadius:15,backgroundColor:theme.colors.card},
  card:{backgroundColor:theme.colors.card,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:theme.colors.border},
  productImage:{width:'100%',height:175},
  productPlaceholder:{height:130,alignItems:'center',justifyContent:'center',backgroundColor:'#e3f3ea'},
  placeholderIcon:{fontSize:42},
  cardBody:{padding:14,gap:11},
  meta:{fontSize:11,fontWeight:'800',color:theme.colors.primaryDark},
  productName:{fontSize:15,fontWeight:'800',color:theme.colors.text},
  muted:{fontSize:12,color:theme.colors.textMuted},
  specs:{padding:10,borderRadius:11,backgroundColor:'#f4f9f5',gap:6},
  specRow:{flexDirection:'row',justifyContent:'space-between',gap:14},
  specValue:{fontSize:12,color:theme.colors.text,fontWeight:'700',flexShrink:1},
  variant:{padding:11,borderRadius:10,borderWidth:1,borderColor:theme.colors.border,gap:4},
  price:{fontSize:18,fontWeight:'800',color:theme.colors.primary},
  disabledCheckout:{borderRadius:10,backgroundColor:'#e2eae5',padding:13,alignItems:'center'},
  disabledCheckoutText:{fontSize:12,fontWeight:'800',color:theme.colors.textMuted},
  reload:{borderRadius:12,borderWidth:1,borderColor:theme.colors.primary,padding:14,alignItems:'center'},
  reloadText:{fontSize:13,color:theme.colors.primaryDark,fontWeight:'800'},
  error:{padding:13,backgroundColor:'#fff1e5',borderRadius:12,color:'#99431a',fontSize:13},
})
