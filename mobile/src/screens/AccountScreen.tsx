/** Premium, native account hub with clear web-only advanced handoffs. */
import { useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { absoluteUrl } from '../api/client'
import { clearTicketWallet } from '../lib/ticket-wallet'
import { useSession } from '../store/session'
import PushSettings from '../components/PushSettings'
import PushDeviceManager from '../components/PushDeviceManager'
import { theme } from '../theme'
import { LabelPill, PremiumBackdrop, SectionHeading, TileGlyph, mobileDesign } from '../ui/PremiumUI'
import type { AccountScreenProps } from '../navigation'

type Glyph = 'ticket'|'event'|'organizer'|'store'|'scanner'|'settings'|'spark'
export default function AccountScreen({ navigation }: AccountScreenProps) {
  const { user, memberships, signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const [linkError, setLinkError] = useState('')
  const initials = (user?.displayName || user?.email || 'U').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')
  const avatarUrl = user?.avatarUrl ? absoluteUrl(user.avatarUrl) : null
  const openPortal = async (path: string) => {
    try { setLinkError(''); await Linking.openURL('https://ieventplux.lightworldtech.com/#' + path) }
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
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.profile}>
      <PremiumBackdrop mode="midnight" />
      {user?.bannerUrl&&absoluteUrl(user.bannerUrl)?<><Image source={{uri:absoluteUrl(user.bannerUrl)!}} style={styles.banner} resizeMode="cover"/><View style={styles.bannerShade}/></>:null}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          {avatarUrl ? <Image source={{uri:avatarUrl}} style={styles.avatarImage} accessibilityLabel="Profile photo"/> : <Text style={styles.initials}>{initials}</Text>}
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name} numberOfLines={2}>{user?.displayName || 'iEventPlux member'}</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email || 'Signed-in member'}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('EditProfile')} style={{marginTop:14,borderWidth:1,borderColor:'#ffffff70',borderRadius:12,minHeight:44,justifyContent:'center',alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'700'}}>Edit profile & branding</Text></Pressable>
      <View style={styles.profileDivider}/>
      <View style={styles.profileBottom}>
        <View><Text style={styles.metricValue}>{memberships.length.toLocaleString('en-US')}</Text><Text style={styles.metricCaption}>organizations</Text></View>

      </View>
    </View>

    <View style={styles.quickGrid}><QuickTile kind="event" title="Create & manage" detail="Events, organizations and stores" onPress={()=>navigation.navigate('CreateHub')}/><QuickTile kind="store" title="Seller Studio" detail="My stores and inventory" onPress={()=>navigation.navigate('SellerStudio')}/></View>
    {user&&<View style={[styles.menu,{padding:14,marginBottom:20,gap:10}]}><Text style={styles.rowTitle}>{user.emailVerifiedAt?'✓ Email verified':'Verify your email'}</Text>{!user.emailVerifiedAt?<><Text style={styles.rowDetail}>Verify your email to publish stores and access account features.</Text><Pressable accessibilityRole="button" onPress={()=>navigation.navigate('VerifyEmail')} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:mobileDesign.emerald,fontWeight:'700'}}>Verify email address ›</Text></Pressable></>:null}</View>}
    {user&&<PushSettings key={user.id} userId={user.id}/>}
    {user&&<PushDeviceManager key={'devices:'+user.id} userId={user.id}/>}
    <SectionHeading title="Your account"/>
    <View style={styles.quickGrid}>
      <QuickTile kind="ticket" title="My tickets" detail="Passes & QR codes" onPress={()=>navigation.navigate('MyTickets')}/>
      <QuickTile kind="spark" title="Messages" detail="Private conversations" onPress={()=>navigation.navigate('DirectMessages')}/>
      <QuickTile kind="spark" title="Notifications" detail="Reminders & updates" onPress={()=>navigation.navigate('Notifications')}/>
      <QuickTile kind="organizer" title="Organizer Studio" detail="Create & manage" onPress={()=>navigation.navigate('OrganizerStudio')}/>
      <QuickTile kind="store" title="Local services" detail="Find help & register" onPress={()=>navigation.navigate('Services')}/>
      <QuickTile kind="scanner" title="Check-in" detail="Scan event passes" onPress={()=>navigation.navigate('Checkin')}/>
    </View>

    <View style={styles.toolsSection}>
      <SectionHeading title="Settings & tools"/>
      <View style={styles.menu}>
        <MenuRow kind="store" title="Advanced organizer tools" detail="Tickets, lineup, team & financial settings" web onPress={()=>void openPortal('/organizer')}/>
        <View style={styles.menuDivider}/>
        <MenuRow kind="settings" title="Edit profile" detail="Photo, banner and personal information" onPress={()=>navigation.navigate('EditProfile')}/>
      </View>
    </View>

    {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
    <Pressable style={({pressed})=>[styles.signOut,pressed&&{opacity:.7}]} disabled={busy} accessibilityRole="button" accessibilityLabel="Sign out of iEventPlux" onPress={()=>void logout()}>
      {busy ? <ActivityIndicator color={theme.colors.danger}/> : <Text style={styles.signOutText}>Sign out</Text>}
    </Pressable>
  </ScrollView>
}

function QuickTile({kind,title,detail,onPress}:{kind:Glyph;title:string;detail:string;onPress:()=>void}){
  return <Pressable style={({pressed})=>[styles.quickTile,pressed&&{opacity:.8,transform:[{scale:.985}]}]}
    accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
    <View style={styles.tileTop}><TileGlyph kind={kind} size={36}/><Text style={styles.quickArrow}>↗</Text></View>
    <Text style={styles.quickTitle}>{title}</Text>
    <Text style={styles.quickDetail}>{detail}</Text>
  </Pressable>
}
function MenuRow({kind,title,detail,onPress,web=false}:{kind:Glyph;title:string;detail:string;onPress:()=>void;web?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityLabel={title} style={({pressed})=>[styles.row,pressed&&{opacity:.7}]} onPress={onPress}>
    <TileGlyph kind={kind} size={36}/>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>
    {web?<LabelPill label="WEB" tone="light"/>:null}
    <Text style={styles.rowChevron}>›</Text>
  </Pressable>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{paddingHorizontal:16,paddingTop:12,paddingBottom:40},
  profile:{borderRadius:18,overflow:'hidden',padding:16,marginBottom:20,backgroundColor:mobileDesign.forestDeep,
    shadowColor:mobileDesign.forestDeep,shadowOpacity:.08,shadowRadius:20,shadowOffset:{width:0,height:12},elevation:6},
  banner:{position:'absolute',width:'100%',height:'100%'},bannerShade:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#071d2b99'},
  profileTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  kicker:{fontSize:10,letterSpacing:1.25,fontWeight:'900',color:'#c4f2e0'},
  profileSpark:{color:'#f3dab1',fontWeight:'900',fontSize:10,letterSpacing:.5},
  identity:{flexDirection:'row',alignItems:'center',gap:12},identityCopy:{flex:1},
  avatar:{width:56,height:56,borderRadius:18,backgroundColor:'#d6f9e9',borderWidth:3,borderColor:'#ffffff99',alignItems:'center',justifyContent:'center',overflow:'hidden'},
  avatarImage:{width:'100%',height:'100%'},initials:{fontSize:22,fontWeight:'700',color:mobileDesign.emerald},
  greeting:{fontSize:10,fontWeight:'900',letterSpacing:1,color:'#b7e4da'},name:{color:'#fff',fontSize:20,fontWeight:'700',letterSpacing:-.9,marginTop:4},
  email:{color:'#dfedea',fontSize:12,marginTop:5},
  profileDivider:{height:1,backgroundColor:'#ffffff35',marginVertical:12},
  profileBottom:{flexDirection:'row',alignItems:'center',gap:17},metricValue:{fontSize:18,fontWeight:'700',color:'#fff'},
  metricCaption:{fontSize:10,marginTop:2,fontWeight:'700',color:'#c7e3dc'},metricDivider:{height:34,width:1,backgroundColor:'#ffffff36'},
  brandPromise:{flex:1},profileArrow:{backgroundColor:'#ffffff1b',width:36,height:36,borderRadius:13,alignItems:'center',justifyContent:'center'},
  profileArrowText:{fontSize:19,color:'#e1f8ec'},
  quickGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12,marginBottom:29},
  quickTile:{width:'48%',backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:16,padding:12,minHeight:106,
    shadowColor:mobileDesign.shadow,shadowOpacity:.06,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:2},
  tileTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',marginBottom:9},
  quickArrow:{fontSize:19,color:mobileDesign.emerald,fontWeight:'800'},
  quickTitle:{fontSize:15,lineHeight:20,fontWeight:'700',color:mobileDesign.ink,letterSpacing:-.35},
  quickDetail:{fontSize:12,marginTop:3,color:mobileDesign.inkMuted},
  toolsSection:{marginBottom:17},menu:{backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,borderRadius:22,overflow:'hidden'},
  row:{flexDirection:'row',alignItems:'center',gap:12,padding:14,minHeight:64},rowCopy:{flex:1},
  rowTitle:{fontSize:14,fontWeight:'700',color:mobileDesign.ink},rowDetail:{fontSize:11,lineHeight:17,color:mobileDesign.inkMuted,marginTop:4},
  rowChevron:{fontSize:23,fontWeight:'700',color:mobileDesign.inkSoft},menuDivider:{marginHorizontal:15,height:1,backgroundColor:mobileDesign.border},
  signOut:{marginTop:9,minHeight:53,borderWidth:1,borderColor:'#f1d1d1',backgroundColor:'#fff',borderRadius:17,alignItems:'center',justifyContent:'center'},
  signOutText:{fontSize:13,fontWeight:'800',color:'#b74643'},error:{color:theme.colors.danger,fontSize:12,marginBottom:10},
  footer:{fontSize:11,fontWeight:'600',textAlign:'center',color:mobileDesign.inkSoft,marginTop:25},
})
