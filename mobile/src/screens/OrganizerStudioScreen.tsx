/** Authenticated native organizer studio. All records are scoped by server-verified
 * accepted memberships; the client-side role badge is only a UI affordance. */
import {useCallback,useMemo,useRef,useState} from 'react'
import {useFocusEffect} from '@react-navigation/native'
import {ActivityIndicator,FlatList,Image,Linking,Pressable,RefreshControl,StyleSheet,Text,View} from 'react-native'
import {absoluteUrl,api,formatDate,type Membership,type OrganizerEventCard} from '../api/client'
import {canManageNativeEvent} from '../lib/organizer-event-form'
import {useSession} from '../store/session'
import {theme} from '../theme'
import {PremiumBackdrop,mobileDesign} from '../ui/PremiumUI'
import type {OrganizerStudioScreenProps} from '../navigation'

const WEB='https://ieventplux.lightworldtech.com/#'
export default function OrganizerStudioScreen({navigation}:OrganizerStudioScreenProps){
  const {status}=useSession()
  const [orgs,setOrgs]=useState<Membership[]>([])
  const [orgId,setOrgId]=useState<string|null>(null)
  const [orgLoading,setOrgLoading]=useState(true)
  const [loading,setLoading]=useState(false)
  const [refreshing,setRefreshing]=useState(false)
  const [loadingMore,setLoadingMore]=useState(false)
  const [items,setItems]=useState<OrganizerEventCard[]>([])
  const [page,setPage]=useState(1)
  const [total,setTotal]=useState(0)
  const [hasMore,setHasMore]=useState(false)
  const [orgError,setOrgError]=useState('')
  const [listError,setListError]=useState('')
  const [webError,setWebError]=useState('')
  const requestRevision=useRef(0)
  const selected=useMemo(()=>orgs.find(o=>o.orgId===orgId),[orgs,orgId])
  const canEdit=selected ? canManageNativeEvent(selected.role) : false

  const refreshOrgs=useCallback(async()=>{
    if(status!=='authenticated')return
    setOrgLoading(true)
    try{
      const result=await api.organizer.memberships()
      setOrgs(result.items)
      setOrgId(current=>result.items.some(o=>o.orgId===current)?current:result.items[0]?.orgId??null)
      setOrgError('')
    }catch(e){setOrgs([]);setOrgId(null);setOrgError(e instanceof Error?e.message:'Could not load organizations.')}
    finally{setOrgLoading(false)}
  },[status])
  // Return from event editor or web organizer registration: get current memberships.
  useFocusEffect(useCallback(()=>{void refreshOrgs()},[refreshOrgs]))
  const load=useCallback(async(nextPage:number,replace:boolean)=>{
    if(!orgId)return
    const revision=replace ? ++requestRevision.current : requestRevision.current
    if(replace)setLoading(true)
    else setLoadingMore(true)
    try{
      const result=await api.organizer.events(orgId,nextPage)
      if(revision!==requestRevision.current)return
      if(replace)setItems(result.items)
      else setItems(existing=>{
        const known=new Set(existing.map(x=>x.id))
        return [...existing,...result.items.filter(x=>!known.has(x.id))]
      })
      setPage(nextPage);setTotal(result.total);setHasMore(result.hasMore);setListError('')
    }catch(e){if(revision===requestRevision.current)setListError(e instanceof Error?e.message:'Unable to load organizer events.')}
    finally{if(revision===requestRevision.current){setLoading(false);setLoadingMore(false);setRefreshing(false)}}
  },[orgId])
  useFocusEffect(useCallback(()=>{
    if(orgId){setItems([]);setTotal(0);setHasMore(false);void load(1,true)}
    else {setItems([]);setTotal(0);setHasMore(false)}
    return()=>{requestRevision.current++}
  },[orgId,load]))
  const openWeb=async(path:string)=>{
    try{setWebError('');await Linking.openURL(WEB+path)}
    catch{setWebError('Could not open the organizer website on this device.')}
  }
  const onRefresh=async()=>{
    setRefreshing(true)
    await Promise.all([refreshOrgs(),...(orgId?[load(1,true)]:[])])
    setRefreshing(false)
  }
  const header=<View style={styles.header}>
    <View style={styles.hero}>
      <PremiumBackdrop mode="midnight"/>
      <Text style={styles.kicker}>THE CREATOR WORKSPACE</Text>
      <Text style={styles.heroTitle}>Your events, your community.</Text>
      <Text style={styles.heroSub}>Manage real events across your authorized organizations. Your native workspace uses the same server as the web portal.</Text>
    </View>
    {orgError?<Text style={styles.error} accessibilityRole="alert">{orgError}</Text>:null}
    {webError?<Text style={styles.error} accessibilityRole="alert">{webError}</Text>:null}
    {orgLoading?<ActivityIndicator style={styles.loader} color={theme.colors.primary}/>:null}
    <Pressable style={styles.secondaryAction} accessibilityRole="button" onPress={()=>navigation.navigate('CreateOrganizer')}><Text style={styles.secondaryText}>＋ Create another organization</Text></Pressable>
    {orgs.length>0?<>
      <Text style={styles.sectionLabel}>YOUR ORGANIZATIONS</Text>
      <View style={styles.orgs}>{orgs.map(org=><Pressable accessibilityRole="button" accessibilityState={{selected:org.orgId===orgId}}
        key={org.orgId} onPress={()=>setOrgId(org.orgId)} style={[styles.orgChip,org.orgId===orgId&&styles.orgActive]}>
        <Text style={[styles.orgName,org.orgId===orgId&&styles.orgNameActive]} numberOfLines={1}>{org.orgName}</Text>
        <Text style={[styles.orgRole,org.orgId===orgId&&styles.orgRoleActive]}>{org.role.replaceAll('_',' ')}</Text>
      </Pressable>)}</View>
      <View style={styles.summaryRow}>
        <View style={styles.stats}><Text style={styles.statNumber}>{total.toLocaleString('en-US')}</Text><Text style={styles.statCaption}>organization events</Text></View>
        <View style={styles.stats}><Text style={styles.statNumber}>{items.filter(x=>x.status==='DRAFT').length}</Text><Text style={styles.statCaption}>drafts on this page</Text></View>
      </View>
      {canEdit?<Pressable style={styles.create} accessibilityRole="button" onPress={()=>navigation.navigate('EventEditor',{orgId:orgId!})}><Text style={styles.createText}>＋  Create an event draft</Text></Pressable>:<Text style={styles.permissionNote}>Your {selected?.role.replaceAll('_',' ').toLowerCase()} membership can view its events. Editing requires an organizer or event manager role.</Text>}
      <Text style={styles.sectionLabel}>MANAGE EVENTS</Text>
      {listError?<View style={styles.alert}><Text style={styles.error} accessibilityRole="alert">{listError}</Text><Pressable accessibilityRole="button" onPress={()=>void load(1,true)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>:null}
      {loading?<ActivityIndicator color={theme.colors.primary} style={styles.loader}/>:null}
    </>:!orgLoading?<View style={styles.empty}><Text style={styles.emptyTitle}>Start with an organizer profile</Text><Text style={styles.emptyBody}>You need an organization or creator profile before publishing events. Set it up here in the native app and complete any required verification afterwards.</Text>
      <Pressable accessibilityRole="button" style={styles.create} onPress={()=>navigation.navigate('CreateOrganizer')}><Text style={styles.createText}>Create organizer profile</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.secondaryAction} onPress={()=>void refreshOrgs()}><Text style={styles.secondaryText}>Refresh my organizations</Text></Pressable>
    </View>:null}
  </View>
  return <FlatList style={styles.screen} contentContainerStyle={styles.content}
    data={items} keyExtractor={item=>item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void onRefresh()} tintColor={theme.colors.primary}/>}
    ListHeaderComponent={header}
    ListEmptyComponent={orgId&&!loading&&!listError?<View style={styles.empty}><Text style={styles.emptyTitle}>No events yet</Text><Text style={styles.emptyBody}>Your organization's drafts and published events will appear here when created.</Text></View>:null}
    renderItem={({item})=><View style={styles.event}>
      <View style={styles.eventMain}>
        {item.coverImageUrl && absoluteUrl(item.coverImageUrl)?<Image source={{uri:absoluteUrl(item.coverImageUrl)!}} style={styles.eventImage} accessibilityLabel={item.title+' artwork'}/>:<View style={[styles.eventImage,styles.eventImagePlaceholder]}><Text style={styles.imagePlaceholderText}>✦</Text></View>}
        <View style={styles.eventInfo}><Text numberOfLines={2} style={styles.eventTitle}>{item.title}</Text><Text style={styles.eventDate}>{formatDate(item.startsAt)}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{item.status.replaceAll('_',' ')} · {item.visibility.replaceAll('_',' ')}</Text></View>
        </View>
      </View>
      <Pressable accessibilityRole="button" style={styles.create} onPress={()=>navigation.navigate('EventManagement',{orgId:orgId!,eventId:item.id})}><Text style={styles.createText}>Manage event · tickets & attendees</Text></Pressable>
      <View style={styles.eventActions}>
        {canEdit?<Pressable style={styles.actionPrimary} accessibilityRole="button" accessibilityLabel={'Edit '+item.title}
          onPress={()=>navigation.navigate('EventEditor',{orgId:orgId!,eventId:item.id})}><Text style={styles.actionPrimaryText}>Edit details</Text></Pressable>:null}
        <Pressable style={styles.actionSecondary} accessibilityRole="button" accessibilityLabel={'Preview '+item.title}
          onPress={()=>navigation.navigate('EventDetail',{eventId:item.id})}><Text style={styles.actionSecondaryText}>Preview event</Text></Pressable>
      </View>
    </View>}
    ListFooterComponent={hasMore?<Pressable accessibilityRole="button" disabled={loadingMore} onPress={()=>void load(page+1,false)} style={styles.loadMore}><Text style={styles.loadMoreText}>{loadingMore?'Loading…':'Load more events'}</Text></Pressable>:selected?<Pressable accessibilityRole="button" onPress={()=>void openWeb('/organizer')} style={styles.fullStudio}><Text style={styles.fullStudioText}>Advanced ticketing, lineup, team & payouts  ↗</Text></Pressable>:null}
  />
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.colors.bg},content:{paddingHorizontal:18,paddingTop:16,paddingBottom:42},
  header:{gap:12,marginBottom:9},hero:{backgroundColor:mobileDesign.forestDeep,padding:25,borderRadius:28,marginBottom:11,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.19,shadowRadius:19,shadowOffset:{width:0,height:10},elevation:5},
  kicker:{color:'#aee7d7',fontSize:10,fontWeight:'900',letterSpacing:1.2},heroTitle:{color:'#fff',fontSize:30,lineHeight:37,fontWeight:'900',marginTop:11,letterSpacing:-1},
  heroSub:{color:'#e4f4ef',fontSize:13,lineHeight:21,marginTop:12},
  sectionLabel:{fontSize:11,fontWeight:'900',letterSpacing:1,color:theme.colors.textMuted,marginTop:8},
  orgs:{flexDirection:'row',flexWrap:'wrap',gap:8},orgChip:{borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff',borderRadius:16,minHeight:57,paddingHorizontal:15,paddingVertical:10,maxWidth:'100%'},
  orgActive:{borderColor:theme.colors.primary,backgroundColor:theme.web.tealSoft},
  orgName:{fontSize:12,fontWeight:'800',color:theme.colors.text},orgNameActive:{color:theme.colors.primary},
  orgRole:{fontSize:10,fontWeight:'700',color:theme.colors.textMuted,marginTop:4},orgRoleActive:{color:theme.colors.primary},
  summaryRow:{flexDirection:'row',gap:9},stats:{flex:1,padding:18,borderRadius:21,backgroundColor:'#fff',borderWidth:1,borderColor:theme.colors.border},
  statNumber:{fontSize:23,fontWeight:'900',color:theme.colors.text},statCaption:{fontSize:11,color:theme.colors.textMuted,marginTop:4},
  create:{backgroundColor:theme.colors.primary,borderRadius:16,minHeight:54,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},
  createText:{fontSize:14,fontWeight:'900',color:'#fff'},permissionNote:{fontSize:12,color:theme.colors.textMuted,lineHeight:19},
  loader:{marginVertical:20},error:{fontSize:12,lineHeight:19,color:theme.colors.danger},alert:{padding:12,backgroundColor:'#fff',borderRadius:12,gap:9},
  retry:{alignSelf:'flex-start',paddingHorizontal:14,paddingVertical:10,backgroundColor:theme.web.tealSoft,borderRadius:10},retryText:{color:theme.colors.primary,fontWeight:'800'},
  empty:{borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff',borderRadius:18,padding:19,gap:11,marginVertical:8},
  emptyTitle:{fontSize:17,fontWeight:'900',color:theme.colors.text},emptyBody:{fontSize:12,lineHeight:20,color:theme.colors.textMuted},
  secondaryAction:{minHeight:45,alignItems:'center',justifyContent:'center'},secondaryText:{color:theme.colors.primary,fontWeight:'800'},
  event:{borderWidth:1,borderColor:theme.colors.border,backgroundColor:'#fff',borderRadius:23,marginBottom:15,padding:15,gap:13,shadowColor:mobileDesign.shadow,shadowOpacity:.05,shadowRadius:12,shadowOffset:{width:0,height:7},elevation:2},
  eventMain:{flexDirection:'row',gap:12},eventImage:{height:94,width:94,borderRadius:16,backgroundColor:theme.colors.border},
  eventImagePlaceholder:{justifyContent:'center',alignItems:'center',backgroundColor:theme.web.tealSoft},imagePlaceholderText:{fontSize:29,color:theme.colors.primary},
  eventInfo:{flex:1,justifyContent:'center',gap:5},eventTitle:{fontWeight:'900',fontSize:15,lineHeight:21,color:theme.colors.text},
  eventDate:{fontSize:11,color:theme.colors.textMuted},badge:{backgroundColor:theme.web.tealSoft,alignSelf:'flex-start',borderRadius:9,paddingHorizontal:8,paddingVertical:5},
  badgeText:{fontSize:10,fontWeight:'800',color:theme.colors.primary},eventActions:{flexDirection:'row',gap:9},
  actionPrimary:{flex:1,minHeight:43,borderRadius:12,justifyContent:'center',alignItems:'center',backgroundColor:theme.colors.primary},
  actionPrimaryText:{color:'#fff',fontWeight:'800',fontSize:12},
  actionSecondary:{flex:1,minHeight:43,borderRadius:12,justifyContent:'center',alignItems:'center',borderColor:theme.colors.border,borderWidth:1},
  actionSecondaryText:{color:theme.colors.text,fontWeight:'800',fontSize:12},
  loadMore:{minHeight:48,borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:theme.colors.border,alignItems:'center',justifyContent:'center'},
  loadMoreText:{color:theme.colors.primary,fontWeight:'900'},fullStudio:{padding:16,alignItems:'center',marginTop:4},fullStudioText:{color:theme.colors.primary,fontSize:12,fontWeight:'800',textAlign:'center'},
})
