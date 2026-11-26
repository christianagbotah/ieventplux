/**
 * Native representation of the exact public event-detail sections on web.
 * The API already removes unpublished performers, archived souvenirs and
 * private invitation-only programme PDFs from responses without permission.
 * Do not invent missing material or unhide server-redacted venue data.
 */
import type { ReactNode } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { absoluteUrl, formatMinor, type EventDetail } from '../api/client'
import { availableSouvenirStock, eventTimeLabel, personRoleLabel, programmeDocumentPath, sortedAgenda, isPhotoGalleryUrl } from '../lib/event-programme'
import { theme } from '../theme'
import { SouvenirRequests } from './SouvenirRequests'

function Section({ title, subtitle, count, children }: {
  title: string; subtitle?: string; count?: number; children: ReactNode
}) {
  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <Text style={styles.heading}>{title}</Text>
      {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
    </View>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    <View style={styles.sectionContent}>{children}</View>
  </View>
}

function CoverThumb({ url, title }: { url?: string | null; title: string }) {
  const source = url ? absoluteUrl(url) : null
  return source ? <Image source={{uri:source}} style={styles.thumb} accessibilityLabel={`${title} photo`} /> :
    <View style={[styles.thumb,styles.thumbPlaceholder]}><Text numberOfLines={2} style={styles.thumbInitial}>{title.slice(0,2).toUpperCase()}</Text></View>
}

export function EventProgrammeSections({ event, onOpenProgramme }: {
  event: EventDetail
  onOpenProgramme: (path: string) => void
}) {
  const lineup = event.contributors ?? []
  const agenda = sortedAgenda(event.agenda ?? [])
  const programmes = event.programmes ?? []
  const souvenirs = event.souvenirs ?? []
  const gallery = (event.gallery ?? []).filter(item=>isPhotoGalleryUrl(item.url))
  const policies = [
    {label:'Accessibility',value:event.accessibilityInfo || event.venue?.accessibilityInfo},
    {label:'Attendance rules',value:event.attendanceRules},
    {label:'Age guidance',value:event.ageGuidance},
    {label:'Refund policy',value:event.refundPolicy},
  ].filter(row => Boolean(row.value))
  return <View>
    {gallery.length ? <Section title="Event gallery" subtitle="Photos and published event artwork" count={gallery.length}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContent}>
        {gallery.map(item => {
          const source=absoluteUrl(item.url)
          return <View key={item.id} style={styles.galleryItem}>
            {source ? <Image source={{uri:source}} style={styles.galleryImage} resizeMode="cover" accessibilityLabel={item.caption || `${event.title} gallery photo`} /> : null}
            {item.caption ? <Text numberOfLines={2} style={styles.galleryCaption}>{item.caption}</Text> : null}
          </View>
        })}
      </ScrollView>
    </Section> : null}

    {lineup.length ? <Section title="Artists, invited guests & speakers"
      subtitle="Meet the people appearing at this event, their roles and topics." count={lineup.length}>
      {lineup.map(person => <View key={person.id} style={styles.profile}>
        <View style={styles.profileHeader}>
          <CoverThumb url={person.photoUrl} title={person.name} />
          <View style={styles.profileHeading}>
            <Text style={styles.profileName}>{person.name}</Text>
            <Text style={styles.role}>{personRoleLabel(person.role)}</Text>
          </View>
        </View>
        {person.topic ? <Text style={styles.topic}>Topic / appearance: {person.topic}</Text> : null}
        {person.startsAt ? <Text style={styles.secondary}>Scheduled: {eventTimeLabel(person.startsAt,event.timezone)}</Text> : null}
        {person.bio ? <Text style={styles.body}>{person.bio}</Text> : null}
      </View>)}
    </Section> : null}

    {programmes.length ? <Section title="Event programme & outlines"
      subtitle="Official PDF documents published by the organizer." count={programmes.length}>
      {programmes.map(document => <Pressable key={document.id} accessibilityRole="button"
        accessibilityLabel={`Open official programme PDF ${document.title}`}
        onPress={()=>onOpenProgramme(programmeDocumentPath(event.id,document.id))}
        style={({pressed})=>[styles.document,pressed && {opacity:.75}]}>
        <Text style={styles.fileIcon}>▤</Text>
        <Text style={styles.documentName}>{document.title}</Text>
        <Text style={styles.documentAction}>View PDF ›</Text>
      </Pressable>)}
      <Text style={styles.hint}>Private programme documents are shown only when the server allows access. A browser sign-in may be required.</Text>
    </Section> : null}

    {souvenirs.length ? <Section title="Event souvenirs & merchandise"
      subtitle="The organizer's published catalogue. Online merchandise checkout is not enabled for this event page." count={souvenirs.length}>
      {souvenirs.map(product => <View key={product.id} style={styles.product}>
        <View style={styles.productHeader}>
          <CoverThumb url={product.imageUrl} title={product.name} />
          <View style={styles.productHeading}>
            <Text style={styles.profileName}>{product.name}</Text>
            {product.variantLabel ? <Text style={styles.secondary}>{product.variantLabel}</Text> : null}
            <Text style={styles.productPrice}>{formatMinor(product.priceMinor)}</Text>
          </View>
        </View>
        {product.description ? <Text style={styles.body}>{product.description}</Text> : null}
        <Text style={styles.secondary}>{availableSouvenirStock(product.available)} · Product code: {product.sku}</Text>
        <Text style={styles.hint}>Purchase requests are not paid orders.</Text>
      </View>)}
    <SouvenirRequests key={event.id} event={event}/></Section> : null}

    {agenda.length ? <Section title="Full event agenda" count={agenda.length}
      subtitle={`Speakers, performances and sessions · Times in ${event.timezone.replace(/_/g,' ')}`}>
      {agenda.map((slot,index)=><View key={slot.id} style={styles.agendaRow}>
        <View style={styles.timeline}><View style={styles.timelineDot}/>{index < agenda.length-1 ? <View style={styles.timelineLine}/> : null}</View>
        <View style={styles.agendaCard}>
          <View style={styles.agendaHeader}><Text style={styles.agendaNumber}>{String(index+1).padStart(2,'0')}</Text><Text style={styles.agendaTitle}>{slot.title}</Text></View>
          <Text style={styles.secondary}>{eventTimeLabel(slot.startsAt,event.timezone)}{slot.endsAt ? ` — ${eventTimeLabel(slot.endsAt,event.timezone)}` : ''}</Text>
          {slot.speaker ? <Text style={styles.role}>Presenter: {slot.speaker}</Text> : null}
          {slot.description ? <Text style={styles.body}>{slot.description}</Text> : null}
        </View>
      </View>)}
    </Section> : null}

    {policies.length ? <Section title="Good to know">
      {policies.map(policy=><View key={policy.label} style={styles.policy}><Text style={styles.policyLabel}>{policy.label}</Text><Text style={styles.body}>{policy.value}</Text></View>)}
    </Section> : null}

    {(event.updates?.length ?? 0)>0 ? <Section title="Organizer announcements" count={event.updates?.length}>
      {event.updates?.map(update => <View key={update.id} style={styles.update}>
        <View style={styles.headingRow}><Text style={styles.profileName}>{update.title}</Text>{update.important ? <Text style={styles.important}>IMPORTANT</Text> : null}</View>
        <Text style={styles.secondary}>{eventTimeLabel(update.createdAt,event.timezone)}</Text>
        <Text style={styles.body}>{update.body}</Text>
      </View>)}
    </Section> : null}
  </View>
}

const styles=StyleSheet.create({
  section:{marginTop:28,padding:18,backgroundColor:theme.colors.card,borderWidth:1,borderColor:theme.colors.border,borderRadius:20},
  headingRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  heading:{flex:1,fontSize:20,fontWeight:'800',lineHeight:28,color:theme.colors.text},
  count:{backgroundColor:theme.web.tealSoft,color:theme.colors.primary,fontSize:12,fontWeight:'900',paddingHorizontal:11,paddingVertical:5,borderRadius:14,overflow:'hidden'},
  subtitle:{fontSize:16,lineHeight:24,color:theme.colors.textMuted,marginTop:7},
  sectionContent:{marginTop:14,gap:12},
  profile:{padding:13,borderWidth:1,borderColor:theme.colors.border,borderRadius:14,backgroundColor:'#fff',gap:9},
  profileHeader:{flexDirection:'row',alignItems:'center',gap:12},
  thumb:{width:59,height:59,borderRadius:12,backgroundColor:theme.web.tealSoft},
  thumbPlaceholder:{alignItems:'center',justifyContent:'center'},
  thumbInitial:{fontSize:16,color:theme.colors.primary,fontWeight:'900',textAlign:'center'},
  profileHeading:{flex:1,gap:4},profileName:{fontSize:17,fontWeight:'700',color:theme.colors.text,lineHeight:24,flexShrink:1},
  role:{fontSize:14,fontWeight:'800',color:theme.colors.primary,marginTop:3},
  topic:{fontSize:16,fontWeight:'800',color:theme.colors.text},
  secondary:{fontSize:14,color:theme.colors.textMuted,lineHeight:21},
  body:{fontSize:16,lineHeight:24,color:theme.colors.text,marginTop:3},
  document:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:theme.colors.border,borderRadius:12,padding:13,minHeight:56},
  fileIcon:{fontSize:21,fontWeight:'900',color:theme.colors.primary},documentName:{flex:1,color:theme.colors.text,fontSize:16,fontWeight:'800'},
  documentAction:{fontSize:14,fontWeight:'800',color:theme.colors.primary},hint:{fontSize:14,lineHeight:21,color:theme.colors.textMuted},
  product:{padding:13,borderWidth:1,borderColor:theme.colors.border,borderRadius:14,gap:8},
  productHeader:{flexDirection:'row',alignItems:'center',gap:12},productHeading:{flex:1,gap:4},
  productPrice:{fontSize:17,fontWeight:'900',color:theme.colors.primary},
  agendaRow:{flexDirection:'row',alignItems:'stretch',gap:10},timeline:{width:11,alignItems:'center',paddingTop:15},
  timelineDot:{height:11,width:11,backgroundColor:theme.colors.primary,borderRadius:6},
  timelineLine:{width:2,flex:1,backgroundColor:'#d2e9e0',marginTop:4},
  agendaCard:{flex:1,backgroundColor:theme.colors.bg,borderRadius:13,borderWidth:1,borderColor:theme.colors.border,padding:12,gap:5},
  agendaHeader:{flexDirection:'row',alignItems:'center',gap:9},agendaNumber:{fontSize:11,fontWeight:'900',color:theme.colors.primary,backgroundColor:theme.web.tealSoft,padding:8,overflow:'hidden',borderRadius:9},
  agendaTitle:{fontSize:17,fontWeight:'900',color:theme.colors.text,flex:1},
  policy:{gap:4,marginBottom:5},policyLabel:{fontSize:14,color:theme.colors.primary,fontWeight:'900'},
  update:{backgroundColor:theme.colors.bg,padding:12,borderRadius:12,gap:4},
  important:{fontSize:9,fontWeight:'900',color:theme.colors.primary},
  galleryContent:{gap:12,paddingRight:12},galleryItem:{width:225},galleryImage:{width:225,height:145,borderRadius:12,backgroundColor:theme.colors.border},
  galleryCaption:{fontSize:14,color:theme.colors.textMuted,marginTop:6},
})
