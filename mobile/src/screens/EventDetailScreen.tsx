/**
 * Event detail — GET /api/v1/events/{id|slug} → ticket types → checkout.
 *
 * Purchase flow (POST /api/v1/orders, then POST /api/v1/payments/initiate):
 *  1. POST /orders reserves inventory and returns `orderReference`
 *     (status PENDING_PAYMENT for paid orders; DRAFT for free RSVP-style ones).
 *  2. POST /payments/initiate returns `checkoutUrl` — Hubtel's hosted checkout
 *     page (or the dev simulator, which returns a relative URL the client
 *     resolves against the API base).
 *  3. We open it in the system browser with Linking.openURL. Payment state only
 *     ever changes via provider callbacks/reconciliation server-side — never
 *     via the return URL. When the deployment is configured to do so, the
 *     browser returns to the app through the `ieventplux://order/{reference}`
 *     deep link (handled in App.tsx's linking config → MyTickets).
 *  4. Free orders skip payment: tickets are issued straight to My tickets.
 *
 * Store-billing honesty note: physical event tickets may be sold via Hubtel
 * hosted checkout (external browser). Digital-only access/subscriptions sold
 * inside a native app require Apple/Google store billing — see
 * docs/NATIVE_MODULES.md. No in-app purchase code exists in this scaffold.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  View,
} from 'react-native'
import {
  ApiClientError,
  absoluteUrl,
  api,
  formatDateTime,
  formatMinor,
  type EventDetailResponse,
  type TicketType,
} from '../api/client'
import { theme } from '../theme'
import {PremiumBackdrop,SectionHeading,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import { EventProgrammeSections } from '../components/EventProgrammeSections'
import { eventTimeLabel } from '../lib/event-programme'
import type { EventDetailScreenProps } from '../navigation'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EventDetailResponse }

export default function EventDetailScreen({ navigation, route }: EventDetailScreenProps) {
  const { eventId } = route.params
  const { width, fontScale } = useWindowDimensions()
  const stackSocial = width < 360 || fontScale >= 1.3
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  /** ticketTypeId → selected quantity (bounded by perBuyerLimit server-side too). */
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [buying, setBuying] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const data = await api.events.get(eventId)
      setState({ status: 'ready', data })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Could not load this event.',
      })
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  const setQty = (tt: TicketType, next: number) => {
    setQuantities((prev) => {
      const current = prev[tt.id] ?? 0
      const remaining = tt.quota > 0 ? Math.max(0, tt.quota - tt.soldCount - tt.reservedCount) : null
      const upper = Math.min(Math.max(1, tt.perBuyerLimit), remaining ?? Number.MAX_SAFE_INTEGER)
      const bounded = Math.max(0, Math.min(upper, next))
      return bounded === current ? prev : { ...prev, [tt.id]: bounded }
    })
  }

  const selectedItems = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.data.event.ticketTypes
      .map((tt) => ({ tt, qty: quantities[tt.id] ?? 0 }))
      .filter(({ qty }) => qty > 0)
  }, [state, quantities])

  const estimatedMinor = useMemo(
    () => selectedItems.reduce((sum, { tt, qty }) => sum + tt.priceMinor * qty, 0),
    [selectedItems]
  )

  const openProgramme = async (path: string) => {
    const url = absoluteUrl(path)
    if (!url) {
      Alert.alert('Programme unavailable', 'This app is not configured with a secure event server address.')
      return
    }
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Unable to open programme', 'Try again when your browser and internet connection are available. Invitation-only documents may require signing in on the website.')
    }
  }

  const buy = async () => {
    if (state.status !== 'ready') return
    if (selectedItems.length === 0) {
      Alert.alert('Select tickets', 'Choose at least one ticket type and quantity first.')
      return
    }
    setBuying(true)
    try {
      const order = await api.orders.create({
        eventId: state.data.event.id,
        items: selectedItems.map(({ tt, qty }) => ({ ticketTypeId: tt.id, qty })),
      })

      if (order.kind === 'FREE' || order.status !== 'PENDING_PAYMENT') {
        Alert.alert(
          'Reservation placed',
          `Order ${order.orderReference} is confirmed. Your tickets are in My tickets.`
        )
        navigation.navigate('MyTickets')
        return
      }

      const payment = await api.payments.initiate(order.orderReference)
      const checkout = absoluteUrl(payment.checkoutUrl)
      if (!checkout) {
        throw new ApiClientError('NO_CHECKOUT_URL', 'The server did not return a usable checkout URL.', 0)
      }
      await Linking.openURL(checkout)
      Alert.alert(
        'Checkout opened',
        `Complete payment for ${order.orderReference} in your browser. When the provider returns you to the app (ieventplux://order/${order.orderReference}), My tickets will refresh — tickets appear after the payment is confirmed server-side.`
      )
    } catch (err) {
      Alert.alert(
        'Checkout failed',
        err instanceof ApiClientError ? `${err.code}: ${err.message}` : 'Unexpected error during checkout.'
      )
    } finally {
      setBuying(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Event unavailable</Text>
        <Text style={styles.mutedCenter}>{state.message}</Text>
        <Pressable style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    )
  }

  const { event, stats, canManage } = state.data
  const currency = event.ticketTypes.find((tt) => tt.priceMinor > 0)?.currency ?? 'GHS'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.coverShell}>
        {event.coverImageUrl && absoluteUrl(event.coverImageUrl) ?
          <Image source={{uri:absoluteUrl(event.coverImageUrl)!}} style={styles.cover} resizeMode="cover" accessibilityLabel={event.title+' event artwork'}/>:
          <View style={[styles.cover,styles.coverPlaceholder]}><PremiumBackdrop mode="midnight"/><Text style={styles.coverPlaceholderText} numberOfLines={3}>{event.title}</Text></View>}
        <View style={styles.coverRibbon}><Text style={styles.coverRibbonText}>✦  iEVENTPLUX EXPERIENCE</Text></View>
        <View style={styles.coverCaption}><Text style={styles.coverCaptionText}>BE PART OF SOMETHING</Text></View>
      </View>

      <View style={styles.eventHeading}>
        <View style={styles.eventBadges}>
          <View style={styles.statusBadge}><Text style={styles.statusBadgeText}>{event.status === 'LIVE' ? '● LIVE NOW' : event.status.replace(/_/g,' ')}</Text></View>
          <View style={styles.modeBadge}><Text style={styles.modeBadgeText}>{event.mode === 'VIRTUAL' ? 'ONLINE' : event.mode === 'HYBRID' ? 'HYBRID' : 'IN PERSON'}</Text></View>
        </View>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.eventOrganizer}>Hosted by <Text style={styles.organizerName}>{event.org.name}</Text></Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}><Text style={styles.infoIcon}>◷</Text><View style={styles.infoBody}><Text style={styles.infoLabel}>DATE & TIME</Text><Text style={styles.infoValue}>{eventTimeLabel(event.startsAt,event.timezone)}</Text><Text style={styles.infoSub}>Timezone: {event.timezone.replace(/_/g,' ')}</Text></View></View>
          <View style={styles.infoDivider}/>
          <View style={styles.infoRow}><Text style={styles.infoIcon}>⌖</Text><View style={styles.infoBody}><Text style={styles.infoLabel}>LOCATION</Text><Text style={styles.infoValue}>{event.mode === 'VIRTUAL' ? 'Online event' : event.venue?.name || 'Venue to be announced'}</Text>
            {event.venue?.address ? <Text style={styles.infoSub}>{event.venue.address}{event.venue.city ? ', '+event.venue.city : ''}</Text> : event.city && event.visibility !== 'INVITE_ONLY' ? <Text style={styles.infoSub}>{event.city}</Text> : null}
          </View></View>
          <View style={styles.infoDivider}/>
          <View style={styles.infoRow}><Text style={styles.infoIcon}>♧</Text><View style={styles.infoBody}><Text style={styles.infoLabel}>EVENT COMMUNITY</Text><Text style={styles.infoValue}>{stats.going.toLocaleString('en-US')} interested</Text></View></View>
        </View>
        {event.summary ? <Text style={styles.summary}>{event.summary}</Text> : null}
        {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
      </View>

      <EventProgrammeSections event={event} onOpenProgramme={path => void openProgramme(path)} />

      <View style={styles.engageSection}>
        <SectionHeading eyebrow="BEYOND THE TICKET" title="Experience together" subtitle="Meet people, join conversations and be part of the event."/>
        <View style={[styles.socialButtons, stackSocial && styles.socialButtonsStacked]}>
          <SocialShortcut title="Group meetings" detail="Camera, mic & live rooms" kind="event" stacked={stackSocial}
            accessibilityLabel="Open this event's group meeting and device permissions"
            onPress={()=>navigation.navigate('MeetingAccess',{eventId:event.id})}/>
          <SocialShortcut title="Conversations" detail="Discuss with your community" kind="organizer" stacked={stackSocial}
            accessibilityLabel="Open event community discussions and replies"
            onPress={()=>navigation.navigate('EventCommunity',{eventId:event.id,eventTitle:event.title,status:event.status,canManage})}/>
          <SocialShortcut title="Find your people" detail="Opt-in attendee connections" kind="organizer" stacked={stackSocial}
            accessibilityLabel="See private opt-in attendee network for this event"
            onPress={()=>navigation.navigate('EventNetwork',{eventId:event.id,eventTitle:event.title})}/>
          <SocialShortcut title="Awards & voting" detail="Celebrate your favorites" kind="spark" stacked={stackSocial}
            accessibilityLabel="View award nominees and cast a free supporter vote"
            onPress={()=>navigation.navigate('EventCompetitions',{eventId:event.id,eventTitle:event.title})}/>
        </View>
      </View>

      <View style={styles.ticketsHeading}><SectionHeading eyebrow="SAVE YOUR PLACE" title="Tickets & entry" subtitle="Choose your pass to join this event"/></View>
      {event.ticketTypes.length === 0 ? (
        <Text style={styles.muted}>No ticket types are on sale for this event yet.</Text>
      ) : (
        event.ticketTypes.map((tt) => (
          <TicketTypeRow
            key={tt.id}
            ticketType={tt}
            qty={quantities[tt.id] ?? 0}
            onDecrement={() => setQty(tt, (quantities[tt.id] ?? 0) - 1)}
            onIncrement={() => setQty(tt, (quantities[tt.id] ?? 0) + 1)}
          />
        ))
      )}

      {selectedItems.length>0?<View style={styles.totalSummary}><Text style={styles.totalSummaryText}>{selectedItems.reduce((n,item)=>n+item.qty,0)} {selectedItems.reduce((n,item)=>n+item.qty,0)===1?'pass':'passes'} selected</Text><Text style={styles.totalSummaryAmount}>{estimatedMinor===0?'Free':formatMinor(estimatedMinor,currency)}</Text></View>:null}
      <Pressable
        style={[styles.buyButton, (buying || selectedItems.length === 0) && styles.buyButtonDisabled]}
        onPress={() => void buy()}
        disabled={buying || selectedItems.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Buy tickets"
      >
        {buying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buyButtonText}>
            {selectedItems.length === 0
              ? 'Select tickets to continue'
              : estimatedMinor === 0
                ? 'Reserve — Free'
                : `Buy — ${formatMinor(estimatedMinor, currency)}`}
          </Text>
        )}
      </Pressable>
      <Text style={styles.footnote}>
        Paid checkout opens Hubtel's hosted page in your browser. The app returns via
        ieventplux://order/{`{reference}`} — payment confirmation always comes from the
        server (provider callbacks), never from the return link alone.
      </Text>

      {canManage ? (
        <Pressable
          style={styles.staffButton}
          onPress={() => navigation.navigate('Checkin', { eventId: event.id })}
          accessibilityRole="button"
          accessibilityLabel="Open check-in scanner for this event"
        >
          <Text style={styles.staffButtonText}>Open check-in scanner (staff)</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

type SocialShortcutKind='event'|'organizer'|'spark'
function SocialShortcut({title,detail,kind,accessibilityLabel,onPress,stacked=false}:{
  title:string;detail:string;kind:SocialShortcutKind;stacked?:boolean;accessibilityLabel:string;onPress:()=>void
}){
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({pressed})=>[styles.socialTile,stacked&&styles.socialTileStacked,pressed&&{opacity:.8}]}>
    <View style={styles.socialTileTop}><TileGlyph kind={kind} size={45}/><Text style={styles.socialTileArrow}>↗</Text></View>
    <Text style={styles.socialTileTitle}>{title}</Text>
    <Text style={styles.socialTileDetail}>{detail}</Text>
  </Pressable>
}

function TicketTypeRow({ticketType,qty,onDecrement,onIncrement}:{ticketType:TicketType;qty:number;onDecrement:()=>void;onIncrement:()=>void}){
  const price=ticketType.priceMinor===0?'Free':formatMinor(ticketType.priceMinor,ticketType.currency)
  const remaining=ticketType.quota>0?ticketType.quota-ticketType.soldCount-ticketType.reservedCount:null
  const limit=Math.max(1,ticketType.perBuyerLimit)
  const cannotAdd=qty>=limit||(remaining!==null&&qty>=remaining)
  return <View style={styles.ticketRow}>
    <View style={styles.ticketMain}>
      <TileGlyph kind="ticket" size={48}/>
      <View style={styles.ticketInfo}>
        <Text style={styles.ticketName}>{ticketType.name}</Text>
        {ticketType.description?<Text style={styles.ticketDescription}>{ticketType.description}</Text>:null}
      </View>
      <View style={styles.ticketTypeBadge}><Text style={styles.ticketTypeBadgeText}>PASS</Text></View>
    </View>
    <View style={styles.ticketBottom}>
      <View style={styles.ticketPriceBlock}>
        <Text style={styles.ticketPrice}>{price}</Text>
        {remaining!==null&&remaining<=10?<Text style={styles.ticketLowStock}>Only {Math.max(0,remaining)} left</Text>:<Text style={styles.ticketUnit}>per pass</Text>}
      </View>
      <View style={styles.qtyControls}>
        <Pressable style={[styles.qtyButton,qty===0&&styles.qtyDisabled]} onPress={onDecrement}
          disabled={qty===0} accessibilityRole="button" accessibilityLabel={'Remove one '+ticketType.name}>
          <Text style={styles.qtyButtonText}>−</Text>
        </Pressable>
        <Text style={styles.qtyValue} accessibilityLabel={'Selected quantity '+qty}>{qty}</Text>
        <Pressable style={[styles.qtyButton,cannotAdd&&styles.qtyDisabled]} onPress={onIncrement}
          disabled={cannotAdd} accessibilityRole="button" accessibilityLabel={'Add one '+ticketType.name}>
          <Text style={styles.qtyButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  </View>
}

const styles=StyleSheet.create({
  screen:{backgroundColor:mobileDesign.canvas,flex:1},content:{paddingHorizontal:20,paddingTop:18,paddingBottom:44},
  center:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:mobileDesign.canvas},
  coverShell:{aspectRatio:16/10,borderRadius:27,backgroundColor:mobileDesign.forestDeep,overflow:'hidden',position:'relative',
    shadowColor:mobileDesign.shadow,shadowOpacity:.13,shadowRadius:20,shadowOffset:{width:0,height:10},elevation:5},
  cover:{width:'100%',height:'100%'},coverPlaceholder:{alignItems:'center',justifyContent:'center',padding:23,overflow:'hidden'},
  coverPlaceholderText:{color:'#fff',fontSize:24,lineHeight:32,fontWeight:'900',textAlign:'center',letterSpacing:-.7},
  coverRibbon:{position:'absolute',top:15,left:15,backgroundColor:'#102637bb',borderRadius:13,paddingVertical:9,paddingHorizontal:12,borderWidth:1,borderColor:'#ffffff66'},
  coverRibbonText:{fontSize:14,color:'#fff',fontWeight:'900',letterSpacing:.9},
  coverCaption:{position:'absolute',bottom:15,right:15,backgroundColor:'#102637b0',paddingVertical:9,paddingHorizontal:12,borderRadius:12},
  coverCaptionText:{fontSize:14,color:'#e6f9eb',fontWeight:'900',letterSpacing:1},
  eventHeading:{marginTop:22},eventBadges:{flexDirection:'row',flexWrap:'wrap',gap:8},
  statusBadge:{backgroundColor:mobileDesign.mintSoft,borderRadius:12,paddingHorizontal:12,paddingVertical:8},
  statusBadgeText:{fontSize:14,fontWeight:'900',color:mobileDesign.emerald,letterSpacing:.4},
  modeBadge:{backgroundColor:'#eff2f8',borderRadius:12,paddingHorizontal:12,paddingVertical:8},
  modeBadgeText:{fontSize:14,fontWeight:'900',color:mobileDesign.inkMuted,letterSpacing:.3},
  title:{marginTop:13,fontSize:29,lineHeight:37,fontWeight:'900',color:mobileDesign.ink,letterSpacing:-1},
  eventOrganizer:{marginTop:11,fontSize:14,color:mobileDesign.inkMuted,lineHeight:19},organizerName:{fontWeight:'900',color:mobileDesign.emerald},
  infoCard:{marginTop:22,backgroundColor:'#fff',borderRadius:23,paddingHorizontal:18,paddingVertical:9,borderWidth:1,borderColor:mobileDesign.border,
    shadowColor:mobileDesign.shadow,shadowOpacity:.04,shadowRadius:13,shadowOffset:{width:0,height:7},elevation:2},
  infoRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16},
  infoIcon:{width:37,fontSize:23,fontWeight:'900',color:mobileDesign.emerald,textAlign:'center'},
  infoBody:{flex:1,gap:4},infoLabel:{fontSize:14,color:mobileDesign.inkMuted,fontWeight:'900',letterSpacing:1},
  infoValue:{fontSize:16,color:mobileDesign.ink,fontWeight:'900',lineHeight:20},infoSub:{fontSize:14,color:mobileDesign.inkMuted,lineHeight:21},
  infoDivider:{height:1,backgroundColor:mobileDesign.border},
  meta:{marginTop:4,color:mobileDesign.inkMuted,fontSize:14},
  summary:{marginTop:23,color:mobileDesign.ink,fontSize:16,lineHeight:24,fontWeight:'800'},
  description:{marginTop:12,color:mobileDesign.inkMuted,fontSize:16,lineHeight:25},
  engageSection:{marginTop:32},socialButtons:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12},
  socialTile:{width:'47.5%',padding:15,minHeight:158,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:23,
    shadowColor:mobileDesign.shadow,shadowOpacity:.05,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:2},
  socialButtonsStacked:{flexDirection:'column'},socialTileStacked:{width:'100%',minHeight:0},
  socialTileTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',marginBottom:17},socialTileArrow:{fontSize:20,color:mobileDesign.emerald,fontWeight:'900'},
  socialTileTitle:{fontSize:17,lineHeight:23,fontWeight:'900',color:mobileDesign.ink},
  socialTileDetail:{fontSize:14,lineHeight:21,color:mobileDesign.inkMuted,marginTop:6},
  ticketsHeading:{marginTop:35},sectionTitle:{fontSize:21,fontWeight:'900',color:mobileDesign.ink},
  ticketRow:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:23,padding:17,marginBottom:13,
    shadowColor:mobileDesign.shadow,shadowOpacity:.045,shadowRadius:12,shadowOffset:{width:0,height:7},elevation:1},
  ticketMain:{flexDirection:'row',alignItems:'flex-start',gap:12},ticketInfo:{flex:1},
  ticketName:{fontSize:17,fontWeight:'900',color:mobileDesign.ink,lineHeight:21},ticketDescription:{fontSize:16,lineHeight:24,color:mobileDesign.inkMuted,marginTop:5},
  ticketTypeBadge:{backgroundColor:mobileDesign.mintSoft,paddingHorizontal:9,paddingVertical:6,borderRadius:10},
  ticketTypeBadgeText:{fontSize:14,color:mobileDesign.emerald,fontWeight:'900',letterSpacing:.4},
  ticketBottom:{flexWrap:'wrap',marginTop:18,paddingTop:14,borderTopWidth:1,borderTopColor:mobileDesign.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  ticketPriceBlock:{flex:1},ticketPrice:{fontSize:20,fontWeight:'900',color:mobileDesign.emerald},ticketLowStock:{fontSize:14,fontWeight:'800',color:'#b25a24',marginTop:3},
  ticketUnit:{fontSize:14,color:mobileDesign.inkMuted,marginTop:3},
  qtyControls:{flexDirection:'row',alignItems:'center',gap:5},
  qtyButton:{width:48,height:48,borderRadius:14,backgroundColor:mobileDesign.mintSoft,borderWidth:1,borderColor:'#c6e6da',alignItems:'center',justifyContent:'center'},
  qtyDisabled:{opacity:.45},qtyButtonText:{fontSize:23,color:mobileDesign.emerald,fontWeight:'800'},
  qtyValue:{minWidth:31,fontSize:16,fontWeight:'900',color:mobileDesign.ink,textAlign:'center'},
  totalSummary:{backgroundColor:'#fff',borderRadius:17,padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:mobileDesign.border,marginTop:9},
  totalSummaryText:{fontSize:14,color:mobileDesign.inkMuted,fontWeight:'700'},totalSummaryAmount:{fontSize:16,fontWeight:'900',color:mobileDesign.ink},
  buyButton:{backgroundColor:mobileDesign.emerald,borderRadius:17,minHeight:55,paddingHorizontal:15,alignItems:'center',justifyContent:'center',marginTop:17},
  buyButtonDisabled:{opacity:.52},buyButtonText:{fontWeight:'700',fontSize:16,color:'#fff'},
  staffButton:{marginTop:20,borderWidth:1,borderColor:'#c4e2d5',borderRadius:15,padding:14,alignItems:'center',backgroundColor:mobileDesign.mintSoft},
  staffButtonText:{fontWeight:'900',fontSize:14,color:mobileDesign.emerald},
  footnote:{marginTop:13,fontSize:14,color:mobileDesign.inkMuted,lineHeight:21,textAlign:'center',marginHorizontal:6},
  errorTitle:{fontSize:19,fontWeight:'900',color:mobileDesign.ink,marginBottom:11},muted:{fontSize:14,color:mobileDesign.inkMuted,lineHeight:21},
  mutedCenter:{fontSize:14,color:mobileDesign.inkMuted,textAlign:'center',lineHeight:21},
  retryButton:{marginTop:20,backgroundColor:mobileDesign.emerald,borderRadius:15,paddingHorizontal:24,minHeight:48,justifyContent:'center'},retryButtonText:{color:'#fff',fontWeight:'900'},
})
