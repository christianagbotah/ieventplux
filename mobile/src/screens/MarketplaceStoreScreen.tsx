/** Real seller catalogue; no checkout until certified provider settlement. */
import {useCallback,useEffect,useRef,useState} from 'react'
import {ActivityIndicator,Alert,Image,Modal,TextInput,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native'
import {absoluteUrl,api,ApiClientError,formatMinor,type NativeStoreDetail,type NativeMarketplaceProduct,type NativeMarketplaceQuote} from '../api/client'
import {marketplaceBasketSelection,canAddBasketUnit} from '../lib/marketplace-basket'
import {theme} from '../theme'
import {useSession} from '../store/session'
import {MarketplaceRequests} from '../components/MarketplaceRequests'
import {LabelPill,PremiumBackdrop,SectionHeading,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type {MarketplaceStoreScreenProps} from '../navigation'

export default function MarketplaceStoreScreen({route}:MarketplaceStoreScreenProps){
  const {slug}=route.params
  const {user}=useSession()
  const [detail,setDetail]=useState<NativeStoreDetail|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [priceVariant,setPriceVariant]=useState<NativeMarketplaceProduct['variants'][number]|null>(null)
  const [priceText,setPriceText]=useState('')
  const [priceBusy,setPriceBusy]=useState(false)
  const [priceError,setPriceError]=useState('')
  const [basket,setBasket]=useState<Record<string,number>>({})
  const [quote,setQuote]=useState<NativeMarketplaceQuote|null>(null)
  const [quoteLoading,setQuoteLoading]=useState(false)
  const [quoteError,setQuoteError]=useState('')
  const quoteEpoch=useRef(0)
  const catalogueEpoch=useRef(0)
  const selected=marketplaceBasketSelection(basket)
  const unavailableLines=selected.filter(line=>!detail?.products.some(p=>p.variants.some(v=>v.id===line.variantId&&v.available>=line.quantity)))
  const changeQuantity=(variantId:string,next:number,available:number)=>{
    if(!Number.isSafeInteger(next)||next<0||next>20||quoteLoading||loading||((basket[variantId]??0)<next&&next>available))return
    setBasket(previous=>{if(next>(previous[variantId]??0)&&!canAddBasketUnit(previous,variantId,available))return previous;const out={...previous};if(next===0)delete out[variantId];else out[variantId]=next;return out})
    quoteEpoch.current++;setQuote(null);setQuoteError('')
  }
  const reviewBasket=async()=>{
    if(!selected.length||unavailableLines.length||quoteLoading||loading)return
    const request=++quoteEpoch.current
    setQuoteLoading(true);setQuoteError('');setQuote(null)
    try{
      const result=await api.marketplace.quote(slug,selected)
      if(result.checkoutEnabled!==false||result.inventoryReserved!==false)throw new Error('Basket review was not safe.')
      if(request===quoteEpoch.current)setQuote(result)
    }catch(cause){if(request===quoteEpoch.current)setQuoteError(cause instanceof ApiClientError?cause.message:cause instanceof Error?cause.message:'Could not check the basket. Please refresh.')}
    finally{if(request===quoteEpoch.current)setQuoteLoading(false)}
  }
  const load=useCallback(async()=>{
    const request=++catalogueEpoch.current
    quoteEpoch.current++;setQuote(null);setQuoteError('');setQuoteLoading(false)
    setLoading(true)
    try{
      const result=await api.marketplace.store(slug)
      if(request===catalogueEpoch.current){setDetail(result);setError('')}
    }catch(cause){if(request===catalogueEpoch.current){setDetail(null);setError(cause instanceof ApiClientError?cause.message:'Cannot load storefront.')}}
    finally{if(request===catalogueEpoch.current)setLoading(false)}
  },[slug,user?.id])
  useEffect(()=>{setDetail(null);setBasket({});setQuote(null);setQuoteError('');void load();return()=>{quoteEpoch.current++;catalogueEpoch.current++}},[load])
  async function savePrice(){
    if(!priceVariant||priceBusy)return
    const match=/^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(priceText.trim())
    if(!match){setPriceError('Enter a positive price with up to two decimal places.');Alert.alert('Invalid price','Enter a positive price with up to two decimal places.');return}
    const minor=Number(match[1])*100+Number((match[2]??'').padEnd(2,'0'))
    if(minor<1||minor>100_000_000){setPriceError('Price is out of range.');Alert.alert('Invalid price','Price is out of range.');return}
    setPriceBusy(true);setPriceError('')
    try{
      await api.marketplace.changePrice(priceVariant.id,minor,priceVariant.priceMinor)
      setPriceVariant(null);Alert.alert('Price updated','The new price has been saved.');await load()
    }catch(e){const message=e instanceof Error?e.message:'Could not update price.';setPriceError(message);Alert.alert('Price not updated',message)}
    finally{setPriceBusy(false)}
  }
  const store=detail?.store
  const cover=store?.coverUrl?absoluteUrl(store.coverUrl):null
  const logo=store?.logoUrl?absoluteUrl(store.logoUrl):null
  return <><ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    {loading&&!detail?<ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader}/>:null}
    {error?<View style={styles.errorBox}><Text style={styles.error} accessibilityRole="alert">{error}</Text>
      <Pressable accessibilityRole="button" onPress={()=>void load()} style={styles.retry}><Text style={styles.retryText}>Try again  ↗</Text></Pressable></View>:null}
    {detail&&store?<>
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        {cover?<Image source={{uri:cover}} style={styles.cover} resizeMode="cover" accessibilityLabel={store.name+' storefront cover'}/>:null}
        {cover?<View style={styles.coverShade}/>:null}
        <View style={styles.heroTop}><Text style={styles.kicker}>THE iEVENTPLUX MARKETPLACE</Text><Text style={styles.heroMark}>✦</Text></View>
        <View style={styles.heroSpacer}/>
        <View style={styles.heroIdentity}>
          <View style={styles.logoBox}>{logo?<Image source={{uri:logo}} style={styles.logo} accessibilityLabel={store.name+' store logo'}/>:<TileGlyph kind="store" size={57}/>}</View>
          <View style={styles.heroLabels}><LabelPill label={store.verificationState==='VERIFIED'?'✓ VERIFIED SELLER':'INDEPENDENT SELLER'} tone={store.verificationState==='VERIFIED'?'mint':'light'}/>
            <Text style={styles.storeTitle}>{store.name}</Text></View>
        </View>
        {store.tagline?<Text style={styles.heroTagline}>{store.tagline}</Text>:null}
        <View style={styles.heroBottom}><Text style={styles.heroMeta}>{[store.city,store.country].filter(Boolean).join(', ')}  ·  {store.category}</Text>
          <Text style={styles.heroCount}>{detail.products.length} products</Text></View>
      </View>
      {store.description?<View style={styles.about}><Text style={styles.aboutTitle}>About this store</Text><Text style={styles.aboutText}>{store.description}</Text></View>:null}
      <View style={styles.notice}><Text style={styles.noticeIcon}>ⓘ</Text><View style={styles.noticeBody}>
        <Text style={styles.noticeTitle}>Product discovery & purchase requests</Text><Text style={styles.noticeText}>Prices, stock and options come from the seller's published catalogue. Online checkout and delivery are not yet available.</Text>
      </View></View>
      <SectionHeading eyebrow="DISCOVER WHAT'S AVAILABLE" title="Products & inventory" subtitle={`${detail.products.length} published products at this storefront`}/>
      {detail.products.length===0?<View style={styles.empty}><TileGlyph kind="store" size={70}/><Text style={styles.emptyTitle}>More products are on the way.</Text>
        <Text style={styles.emptyBody}>This store has no published products yet. Check back as the seller adds new items.</Text></View>:
        detail.products.map(item=><ProductCard key={item.id} item={item} basket={basket} onChangeQty={changeQuantity} canSelect={!detail.canManage} selectionLocked={quoteLoading||loading} onEditPrice={detail.canManage&&store.status!=='SUSPENDED'&&item.status!=='ARCHIVED'?(v)=>{setPriceVariant(v);setPriceText((v.priceMinor/100).toFixed(2));setPriceError('')}:undefined}/>)}
    </>:null}
    {detail&&!detail.canManage?<View style={styles.basketPanel}>
      <Text style={styles.basketKicker}>YOUR SHOPPING SELECTION</Text>
      <Text style={styles.basketTitle}>Review product prices & stock</Text>
      <Text style={styles.basketInfo}>{selected.reduce((sum,line)=>sum+line.quantity,0)} units · {selected.length} selected options. No stock is held.</Text>
      <Pressable accessibilityRole="button" disabled={!selected.length||unavailableLines.length>0||quoteLoading||loading} onPress={()=>void reviewBasket()}
        style={[styles.quoteButton,(!selected.length||unavailableLines.length>0||quoteLoading||loading)&&styles.quoteDisabled]}>
        <Text style={styles.quoteButtonText}>{quoteLoading?'Checking live catalogue…':'Check current prices & stock'}</Text>
      </Pressable>
      <Text style={styles.basketInfo}>Up to 15 options and 50 units per review.</Text>
      {selected.length>0?<Pressable accessibilityRole="button" disabled={loading||quoteLoading} style={[styles.reload,(loading||quoteLoading)&&styles.quoteDisabled]} onPress={()=>{quoteEpoch.current++;setBasket({});setQuote(null);setQuoteError('')}}><Text style={styles.reloadText}>Clear selection</Text></Pressable>:null}
      {unavailableLines.length>0&&!loading?<Text style={styles.quoteError} accessibilityRole="alert">Some selected items are no longer available in the chosen quantity. Reduce their quantities or clear the selection to start again.</Text>:null}
      {quoteError?<Text style={styles.quoteError} accessibilityRole="alert">{quoteError}</Text>:null}
      {quote?<View style={styles.quoteResult}>
        {quote.items.map(line=><View key={line.variantId} style={styles.quoteRow}>
          <Text style={styles.quoteLine}>{line.productName} · {line.variantTitle} × {line.quantity}</Text>
          <Text style={styles.quotePrice}>{formatMinor(line.lineMinor,line.currency)}</Text>
        </View>)}
        <View style={styles.quoteRow}><Text style={styles.quoteTotalLabel}>Merchandise subtotal</Text>
          <Text style={styles.quoteTotal}>{formatMinor(quote.totalMinor,quote.currency)}</Text></View>
        <Text style={styles.basketInfo}>{quote.notice} Delivery fees, taxes and final payment are not calculated.</Text>
      </View>:null}
      {!quote?<Text style={styles.basketInfo}>Select product quantities above. This is an estimate, not an order or checkout.</Text>:null}
    </View>:null}
    {detail&&user?<MarketplaceRequests key={user.id+':'+slug+':'+detail.canManage} slug={slug} seller={detail.canManage} quote={quote} onSubmitted={submitted=>setQuote(current=>current===submitted?null:current)}/>:null}
    {detail&&!user?<Text style={styles.basketInfo}>Sign in to submit purchase requests.</Text>:null}
    {detail?<Pressable onPress={()=>void load()} style={styles.reload} accessibilityRole="button"><Text style={styles.reloadText}>Refresh catalogue  ↻</Text></Pressable>:null}
  </ScrollView>
    <Modal transparent animationType="fade" visible={priceVariant!==null} onRequestClose={()=>{if(!priceBusy)setPriceVariant(null)}} accessibilityViewIsModal>
      <View style={styles.priceBackdrop}><View style={styles.priceDialog}>
        <Text style={styles.basketTitle}>Edit product price</Text>
        <Text style={styles.basketInfo}>{priceVariant?.title} · {priceVariant?.sku}. Inventory is unchanged.</Text>
        <Text style={styles.variantName}>New price (₵)</Text>
        <TextInput accessibilityLabel="New price in Ghana cedis" keyboardType="decimal-pad" editable={!priceBusy} value={priceText} onChangeText={setPriceText} style={styles.priceInput}/>
        {priceError?<Text accessibilityRole="alert" style={styles.quoteError}>{priceError}</Text>:null}
        <Pressable accessibilityRole="button" disabled={priceBusy} onPress={()=>void savePrice()} style={styles.quoteButton}><Text style={styles.quoteButtonText}>{priceBusy?'Saving…':'Save price'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={priceBusy} onPress={()=>setPriceVariant(null)} style={styles.reload}><Text style={styles.reloadText}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </>
}
function ProductCard({item,basket,onChangeQty,canSelect,selectionLocked,onEditPrice}:{item:NativeMarketplaceProduct;basket:Record<string,number>;onChangeQty:(id:string,next:number,available:number)=>void;canSelect:boolean;selectionLocked:boolean;onEditPrice?: (variant:NativeMarketplaceProduct['variants'][number])=>void}){
  const photo=item.images[0]?absoluteUrl(item.images[0]):null
  const priced=item.variants.filter(variant=>variant.priceMinor>=0)
  const from=priced.length?priced.reduce((min,v)=>v.priceMinor<min.priceMinor?v:min,priced[0]!):null
  return <View style={styles.card}>
    <View style={styles.photoWrap}>
      {photo?<Image source={{uri:photo}} style={styles.productImage} resizeMode="cover" accessibilityLabel={item.name+' product photograph'}/>:
        <View style={styles.productPlaceholder}><PremiumBackdrop mode="ocean"/><TileGlyph kind="store" size={74}/></View>}
      <View style={styles.productCategory}><Text style={styles.productCategoryText}>{item.category}</Text></View>
    </View>
    <View style={styles.cardBody}>
      <Text style={styles.productName}>{item.name}</Text>
      {item.brand?<Text style={styles.brand}>By {item.brand}</Text>:null}
      {item.shortDesc?<Text style={styles.productDescription}>{item.shortDesc}</Text>:null}
      {item.description?<Text style={styles.productDescription}>{item.description}</Text>:null}
      {from?<Text style={styles.price}>From {formatMinor(from.priceMinor,from.currency)}</Text>:null}
      {Object.keys(item.specifications).length>0?<View style={styles.specs}><Text style={styles.specTitle}>PRODUCT DETAILS</Text>
        {Object.entries(item.specifications).map(([key,value])=><View key={key} style={styles.specRow}><Text style={styles.specKey}>{key}</Text><Text style={styles.specValue}>{value}</Text></View>)}
      </View>:null}
      {item.variants.length>0?<View style={styles.variants}><Text style={styles.variantsTitle}>AVAILABLE OPTIONS</Text>
        {item.variants.map(variant=><View key={variant.id} style={styles.variant}>
          <View style={styles.variantDetails}><View style={{flex:1}}><Text style={styles.variantName}>{variant.title}</Text><Text style={styles.variantSku}>SKU {variant.sku}</Text></View>
          <View style={styles.variantRight}><Text style={styles.variantPrice}>{formatMinor(variant.priceMinor,variant.currency)}</Text>
            <Text style={[styles.variantStock,variant.available===0&&styles.variantOut]}>{variant.available>0?`${variant.available} in stock`:'Out of stock'}</Text>
          </View></View>
          {onEditPrice&&variant.active?<Pressable accessibilityRole="button" onPress={()=>onEditPrice(variant)} style={styles.reload}><Text style={styles.reloadText}>Edit price</Text></Pressable>:null}
          {canSelect?<View style={styles.qtyGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Remove one '+variant.title}
              disabled={selectionLocked||!(basket[variant.id]??0)} style={[styles.qtyButton,(selectionLocked||!(basket[variant.id]??0))&&styles.qtyDisabled]}
              onPress={()=>onChangeQty(variant.id,(basket[variant.id]??0)-1,variant.available)}><Text style={styles.qtyGlyph}>−</Text></Pressable>
            <Text style={styles.qtyText}>{basket[variant.id]??0}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={'Add one '+variant.title}
              disabled={selectionLocked||!canAddBasketUnit(basket,variant.id,variant.available)}
              style={[styles.qtyButton,(selectionLocked||!canAddBasketUnit(basket,variant.id,variant.available))&&styles.qtyDisabled]}
              onPress={()=>onChangeQty(variant.id,(basket[variant.id]??0)+1,variant.available)}><Text style={styles.qtyGlyph}>+</Text></Pressable>
          </View>:null}
        </View>)}
      </View>:null}
      {canSelect?<View style={styles.checkoutNotice}><Text style={styles.checkoutNoticeText}>Checkout & delivery not yet available</Text></View>:null}
    </View>
  </View>
}
const styles=StyleSheet.create({
  priceBackdrop:{flex:1,justifyContent:"center",padding:20,backgroundColor:"rgba(9,21,33,.70)"},priceDialog:{backgroundColor:"#fff",borderRadius:24,padding:22,gap:12},priceInput:{borderWidth:1,borderColor:mobileDesign.border,borderRadius:12,padding:13,fontSize:17,color:mobileDesign.ink},
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,paddingBottom:42,gap:18},loader:{margin:22},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:28,overflow:'hidden',padding:21,minHeight:315,
    shadowColor:mobileDesign.forestDeep,shadowOpacity:.22,shadowRadius:20,shadowOffset:{width:0,height:12},elevation:5},
  cover:{position:'absolute',width:'100%',height:'100%'},coverShade:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'rgba(6,23,34,.48)'},
  heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},kicker:{color:'#e1f7e8',fontSize:10,fontWeight:'900',letterSpacing:1.1},heroMark:{fontSize:24,color:mobileDesign.gold},
  heroSpacer:{minHeight:65,flex:1},heroIdentity:{flexDirection:'row',alignItems:'center',gap:12},
  logoBox:{height:70,width:70,borderRadius:21,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',overflow:'hidden',borderColor:'#ffffffbd',borderWidth:3},
  logo:{height:'100%',width:'100%'},heroLabels:{flex:1,alignItems:'flex-start',gap:9},
  storeTitle:{fontSize:25,lineHeight:31,fontWeight:'900',color:'#fff',letterSpacing:-.8},
  heroTagline:{fontSize:13,lineHeight:20,color:'#e8f7ed',marginTop:14},
  heroBottom:{borderTopWidth:1,borderTopColor:'#ffffff3f',marginTop:17,paddingTop:13,flexDirection:'row',justifyContent:'space-between',gap:9,alignItems:'center'},
  heroMeta:{fontSize:11,color:'#d1e8e0',flex:1},heroCount:{color:'#fff',fontSize:11,fontWeight:'900'},
  about:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:21,padding:17,gap:8},
  aboutTitle:{fontSize:16,fontWeight:'900',color:mobileDesign.ink},aboutText:{fontSize:13,lineHeight:22,color:mobileDesign.inkMuted},
  notice:{backgroundColor:mobileDesign.mintSoft,borderRadius:18,padding:14,flexDirection:'row',gap:11},noticeIcon:{fontSize:18,color:mobileDesign.emerald},
  noticeBody:{flex:1,gap:5},noticeTitle:{fontSize:13,fontWeight:'900',color:mobileDesign.emerald},noticeText:{fontSize:11,lineHeight:19,color:'#37665c'},
  empty:{padding:27,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:24,alignItems:'center',gap:12},
  emptyTitle:{color:mobileDesign.ink,fontSize:20,fontWeight:'900',textAlign:'center'},emptyBody:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:20,textAlign:'center'},
  card:{backgroundColor:'#fff',borderRadius:25,overflow:'hidden',borderWidth:1,borderColor:mobileDesign.border,
    shadowColor:mobileDesign.shadow,shadowOpacity:.07,shadowRadius:15,shadowOffset:{width:0,height:8},elevation:2},
  photoWrap:{height:220,backgroundColor:mobileDesign.forest,overflow:'hidden'},productImage:{width:'100%',height:'100%'},
  productPlaceholder:{flex:1,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  productCategory:{position:'absolute',top:14,left:14,backgroundColor:'#0b2737d7',paddingVertical:8,paddingHorizontal:11,borderRadius:11,borderWidth:1,borderColor:'#ffffff55'},
  productCategoryText:{fontSize:10,fontWeight:'900',color:'#fff',letterSpacing:.3},
  cardBody:{padding:17,gap:10},productName:{fontSize:19,lineHeight:25,fontWeight:'900',color:mobileDesign.ink},
  brand:{fontSize:11,color:mobileDesign.emerald,fontWeight:'800'},productDescription:{fontSize:12,lineHeight:20,color:mobileDesign.inkMuted},
  price:{fontSize:20,color:mobileDesign.emerald,fontWeight:'900',marginTop:4},
  specs:{borderRadius:16,backgroundColor:'#f5f8f7',padding:13,gap:9},specTitle:{fontSize:9,fontWeight:'900',color:mobileDesign.emerald,letterSpacing:.8},
  specRow:{flexDirection:'row',justifyContent:'space-between',gap:14},specKey:{color:mobileDesign.inkMuted,fontSize:11,flex:1},specValue:{color:mobileDesign.ink,fontSize:11,fontWeight:'800',flex:1,textAlign:'right'},
  variants:{gap:10,marginTop:4},variantsTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:mobileDesign.emerald},
  variant:{gap:10,borderRadius:15,borderWidth:1,borderColor:mobileDesign.border,padding:13},
  variantDetails:{flexDirection:'row',alignItems:'center',gap:12},
  variantName:{fontSize:12,fontWeight:'900',color:mobileDesign.ink},variantSku:{fontSize:10,color:mobileDesign.inkSoft,marginTop:4},
  variantRight:{alignItems:'flex-end'},variantPrice:{fontSize:14,color:mobileDesign.emerald,fontWeight:'900'},
  variantStock:{fontSize:10,color:mobileDesign.emerald,marginTop:4},variantOut:{color:'#b34843'},
  qtyGroup:{flexDirection:'row',alignItems:'center',gap:9,marginTop:10,justifyContent:'flex-end'},
  qtyButton:{height:38,width:38,borderWidth:1,borderColor:mobileDesign.border,borderRadius:12,backgroundColor:'#f5faf7',alignItems:'center',justifyContent:'center'},
  qtyDisabled:{opacity:.35},qtyGlyph:{fontSize:21,fontWeight:'900',color:mobileDesign.emerald},
  qtyText:{fontSize:13,fontWeight:'900',color:mobileDesign.ink,minWidth:26,textAlign:'center'},
  basketPanel:{padding:19,backgroundColor:'#fff',borderRadius:23,borderWidth:1,borderColor:mobileDesign.border,gap:12},
  basketKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:mobileDesign.emerald},
  basketTitle:{fontSize:19,lineHeight:25,fontWeight:'900',color:mobileDesign.ink},
  basketInfo:{fontSize:11,lineHeight:18,color:mobileDesign.inkMuted},
  quoteButton:{minHeight:50,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:mobileDesign.emerald,padding:12},
  quoteDisabled:{opacity:.45},quoteButtonText:{color:'#fff',fontSize:12,fontWeight:'900'},
  quoteError:{color:theme.colors.danger,fontSize:12,lineHeight:18},
  quoteResult:{backgroundColor:'#f5faf7',padding:13,borderRadius:15,gap:11},
  quoteRow:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:9},
  quoteLine:{flex:1,fontSize:11,lineHeight:18,color:mobileDesign.ink},
  quotePrice:{fontSize:12,fontWeight:'900',color:mobileDesign.emerald},
  quoteTotalLabel:{fontSize:13,fontWeight:'900',color:mobileDesign.ink},
  quoteTotal:{fontSize:18,fontWeight:'900',color:mobileDesign.emerald},
  checkoutNotice:{backgroundColor:'#eef1f3',minHeight:48,borderRadius:14,justifyContent:'center',alignItems:'center',paddingHorizontal:11},
  checkoutNoticeText:{fontSize:12,color:mobileDesign.inkMuted,fontWeight:'900',textAlign:'center'},
  reload:{minHeight:50,borderRadius:15,borderWidth:1,borderColor:mobileDesign.border,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  reloadText:{color:mobileDesign.emerald,fontSize:12,fontWeight:'900'},
  errorBox:{padding:15,borderRadius:15,backgroundColor:'#fff0ed',gap:9},error:{color:theme.colors.danger,fontSize:12,lineHeight:18},
  retry:{alignSelf:'flex-start',minHeight:37,justifyContent:'center'},retryText:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},
})
