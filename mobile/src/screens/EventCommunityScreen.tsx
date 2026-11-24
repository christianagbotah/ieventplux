/**
 * First-class native event community, using the same moderated server API as
 * the web. No separate message store and no offline replay of private posts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native'
import { absoluteUrl, api, ApiClientError, type CommunityComment } from '../api/client'
import { ActionDialog, type ActionPrompt } from '../components/ActionDialog'
import {
  communityCanPost, communityUnavailableStatus, mergeCommunityThreads, validCommunityPost,
} from '../lib/event-social-policy'
import { useSession } from '../store/session'
import { theme } from '../theme'
import {PremiumBackdrop,TileGlyph,mobileDesign} from '../ui/PremiumUI'
import type { EventCommunityScreenProps } from '../navigation'

const STARTERS = [
  { label: 'Introduce yourself', text: 'Hello everyone! I am attending because ' },
  { label: 'Ask an organizer', text: 'Question for the organizer: ' },
  { label: 'Share a tip', text: 'A helpful tip for other participants: ' },
] as const

function humanTime(date: string): string {
  const time = Date.parse(date)
  return Number.isFinite(time) ? new Date(time).toLocaleString() : ''
}

export default function EventCommunityScreen({ route }: EventCommunityScreenProps) {
  const { eventId, eventTitle, status, canManage } = route.params
  const { user } = useSession()
  const canPost = communityCanPost(status)
  const [items, setItems] = useState<CommunityComment[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [inaccessible, setInaccessible] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [draft, setDraft] = useState('')
  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const requestRevision = useRef(0)

  const load = useCallback(async (targetPage: number, append = false) => {
    const revision = ++requestRevision.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const response = await api.community.list(eventId, targetPage)
      if (revision !== requestRevision.current) return
      setItems((current) => mergeCommunityThreads(current, response, append))
      setPage(targetPage)
      setTotal(response.total)
      setInaccessible(false)
      setError('')
    } catch (reason) {
      if (revision !== requestRevision.current) return
      if (reason instanceof ApiClientError && communityUnavailableStatus(reason.status)) {
        setItems([])
        setInaccessible(true)
        setError('')
      } else {
        setError(reason instanceof ApiClientError ? reason.message : 'Unable to load conversations.')
      }
    } finally {
      if (revision === requestRevision.current) {setLoading(false);setLoadingMore(false)}
    }
  }, [eventId])

  useEffect(() => { void load(1); return () => {requestRevision.current++} }, [load])

  const publish = async (parentId?: string) => {
    const content = (parentId ? replyDraft : draft).trim()
    if (posting || !canPost || inaccessible || !validCommunityPost(content)) return
    setPosting(true)
    try {
      await api.community.post(eventId, content, parentId)
      setDraft('')
      setReplyDraft('')
      setReplyId(null)
      await load(1)
      setError('')
      setFeedback(parentId ? 'Reply posted successfully.' : 'Conversation published successfully.')
    } catch (reason) {
      setFeedback('')
      setError(reason instanceof ApiClientError ? reason.message : 'Your message could not be published.')
    } finally {
      setPosting(false)
    }
  }

  const actOn = (comment: CommunityComment, kind: 'report' | 'remove') => {
    const isRemoval = kind === 'remove'
    setPrompt({
      title: isRemoval ? 'Remove this message?' : 'Report this message?',
      description: isRemoval
        ? 'This conversation will no longer be visible to participants. Removing a post cannot be undone here.'
        : 'Your report will be sent to platform moderators. Reports do not automatically remove messages.',
      confirmLabel: isRemoval ? 'Remove message' : 'Submit report',
      destructive: isRemoval,
      onConfirm: () => {
        if (actionBusy) return
        setActionBusy(true)
        void (async () => {
          try {
            if (isRemoval) await api.community.remove(comment.id)
            else await api.community.report(comment.id)
            if (isRemoval) await load(1)
            setError('')
            setFeedback(isRemoval ? 'Message removed.' : 'Report sent to moderators.')
          } catch (reason) {
            setFeedback('')
            setError(reason instanceof ApiClientError ? reason.message : 'Could not complete this action.')
          } finally { setActionBusy(false); setPrompt(null) }
        })()
      },
    })
  }

  const commentRow = (comment: CommunityComment, nested: boolean) =>
    <View key={comment.id} style={[styles.messageRow, nested && styles.replyBox]}>
      {comment.user.avatarUrl && absoluteUrl(comment.user.avatarUrl) ? <Image source={{ uri: absoluteUrl(comment.user.avatarUrl)! }} style={styles.avatar} accessibilityLabel={comment.user.displayName+' profile photo'}/> :
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{(comment.user.displayName || '?').slice(0, 1).toUpperCase()}</Text>
        </View>}
      <View style={styles.messageContent}>
        <Text numberOfLines={1} style={styles.author}>{comment.user.displayName}</Text>
        <Text style={styles.date}>{humanTime(comment.createdAt)}</Text>
        <Text style={styles.messageText}>{comment.body}</Text>
        <View style={styles.actionRow}>
          {!nested && canPost && <Pressable accessibilityRole="button"
            accessibilityLabel={'Reply to ' + comment.user.displayName}
            onPress={() => { setReplyId(replyId === comment.id ? null : comment.id); setReplyDraft('') }}>
            <Text style={styles.link}>Reply</Text>
          </Pressable>}
          {(canManage || user?.id === comment.user.id) && canPost && <Pressable accessibilityRole="button"
            onPress={() => actOn(comment, 'remove')}>
            <Text style={styles.deleteLink}>Remove</Text>
          </Pressable>}
          {user && user.id !== comment.user.id && <Pressable accessibilityRole="button"
            onPress={() => actOn(comment, 'report')}>
            <Text style={styles.mutedLink}>Report</Text>
          </Pressable>}
        </View>
      </View>
    </View>

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <PremiumBackdrop mode="midnight"/>
        <View style={styles.heroTop}><Text style={styles.eyebrow}>✦  YOUR EVENT COMMUNITY</Text><Text style={styles.heroSymbol}>◎</Text></View>
        <Text style={styles.title}>Good conversations start here.</Text>
        <Text style={styles.heroDescription} numberOfLines={2}>{eventTitle}</Text>
        <Text style={styles.heroNote}>Meet your community, ask questions and share the moments that bring people together.</Text>
        <View style={styles.heroMeta}><Text style={styles.heroMetaText}>MODERATED CONVERSATIONS</Text><Text style={styles.heroMetaText}>●  EVENT COMMUNITY</Text></View>
      </View>
      {inaccessible ? <View style={styles.card}>
        <Text style={styles.cardTitle}>This community is private</Text>
        <Text style={styles.muted}>Only participants with appropriate event access can view these conversations.</Text>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void load(1)}>
          <Text style={styles.secondaryText}>Check access again</Text>
        </Pressable>
      </View> : <>
        {!canPost ? <Text style={styles.notice}>This event discussion is read-only.</Text> : <View style={styles.card}>
          <View style={styles.composeHeading}><TileGlyph kind="organizer" size={45}/><View style={styles.composeHeadingText}><Text style={styles.cardTitle}>Join the discussion</Text><Text style={styles.muted}>Make your voice part of the experience</Text></View></View>
          <View style={styles.starters}>
            {STARTERS.map((starter) => <Pressable accessibilityRole="button"
              key={starter.label} onPress={() => setDraft(starter.text)}
              style={styles.starter}>
              <Text style={styles.starterText}>{starter.label}</Text>
            </Pressable>)}
          </View>
          <TextInput style={styles.composer} multiline value={draft} maxLength={1000}
            onChangeText={setDraft} placeholder="Write your introduction or question…"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Write a community message" textAlignVertical="top" />
          <View style={styles.composeFooter}>
            <Text style={styles.muted}>{draft.length}/1,000</Text>
            <Pressable accessibilityRole="button"
              style={[styles.primaryButton, (!validCommunityPost(draft) || posting) && styles.disabled]}
              disabled={!validCommunityPost(draft) || posting}
              onPress={() => void publish()}>
              <Text style={styles.primaryText}>{posting ? 'Publishing…' : 'Publish post'}</Text>
            </Pressable>
          </View>
        </View>}
        <View style={styles.threadHeader}>
          <View><Text style={styles.sectionEyebrow}>THE COMMUNITY FEED</Text><Text style={styles.threadTitle}>Conversations {total > 0 ? '(' + total + ')' : ''}</Text></View>
          <Pressable accessibilityRole="button" style={styles.refresh} onPress={() => void load(1)}>
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        </View>
        {loading && items.length === 0 ? <ActivityIndicator size="large" color={theme.colors.primary} /> :
          items.length === 0 ? <View style={styles.empty}>
            <TileGlyph kind="organizer" size={70}/>
            <Text style={styles.cardTitle}>Your community is ready for a conversation.</Text>
            <Text style={styles.muted}>Be the first to ask a question or introduce yourself.</Text>
          </View> :
            items.map((thread) => {
              const replies = thread.children || []
              const replyCount = thread._count?.children ?? replies.length
              const showAll = expanded[thread.id] === true
              return <View key={thread.id} style={styles.card}>
                {commentRow(thread, false)}
                {replies.length > 0 && <View style={styles.threadReplies}>
                  <Pressable accessibilityRole="button" onPress={() => setExpanded(current => ({
                    ...current, [thread.id]: !showAll,
                  }))}>
                    <Text style={styles.link}>{showAll ? 'Hide replies' : 'View ' + replyCount + (replyCount === 1 ? ' reply' : ' replies')}</Text>
                  </Pressable>
                  {(showAll ? replies : replies.slice(0, 2)).map((reply) => commentRow(reply, true))}
                  {showAll && replies.length < replyCount && <Text style={styles.muted}>Showing the first 40 replies.</Text>}
                </View>}
                {replyId === thread.id && canPost && <View style={styles.replyComposer}>
                  <TextInput style={styles.replyInput} value={replyDraft} multiline
                    placeholder={'Reply to ' + thread.user.displayName}
                    placeholderTextColor={theme.colors.textMuted}
                    onChangeText={setReplyDraft} maxLength={1000} textAlignVertical="top"
                    accessibilityLabel="Write a reply" />
                  <View style={styles.composeFooter}>
                    <Pressable accessibilityRole="button" onPress={() => setReplyId(null)}>
                      <Text style={styles.mutedLink}>Cancel</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => void publish(thread.id)}
                      disabled={!validCommunityPost(replyDraft) || posting}
                      style={[styles.primaryButton, (!validCommunityPost(replyDraft) || posting) && styles.disabled]}>
                      <Text style={styles.primaryText}>Post reply</Text>
                    </Pressable>
                  </View>
                </View>}
              </View>
            })}
        {items.length < total && <Pressable accessibilityRole="button"
          onPress={() => void load(page + 1, true)} disabled={loadingMore}
          style={styles.loadMore}><Text style={styles.secondaryText}>{loadingMore ? 'Loading…' : 'Load older conversations'}</Text></Pressable>}
      </>}
      {feedback ? <Text accessibilityRole="alert" style={styles.success}>{feedback}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <ActionDialog prompt={prompt} onDismiss={() => setPrompt(null)} busy={actionBusy} />
  </View>
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:mobileDesign.canvas},content:{padding:18,gap:17,paddingBottom:45},
  hero:{backgroundColor:mobileDesign.forestDeep,borderRadius:29,padding:23,overflow:'hidden',shadowColor:mobileDesign.forestDeep,shadowOpacity:.18,shadowRadius:19,shadowOffset:{width:0,height:11},elevation:5},
  heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroSymbol:{fontSize:25,color:mobileDesign.gold,fontWeight:'900'},
  eyebrow:{color:'#cbf9e6',letterSpacing:1.25,fontSize:10,fontWeight:'900'},
  title:{color:'#fff',fontSize:29,lineHeight:37,letterSpacing:-.9,fontWeight:'900',marginTop:20},
  heroDescription:{color:'#fff',fontWeight:'900',fontSize:13,marginTop:13,lineHeight:20},
  heroNote:{color:'#d5f1e5',fontSize:13,lineHeight:21,marginTop:8},
  heroMeta:{borderTopColor:'#ffffff45',borderTopWidth:1,marginTop:20,paddingTop:14,flexDirection:'row',gap:9,flexWrap:'wrap'},
  heroMetaText:{color:'#cceae1',fontSize:9,fontWeight:'900',letterSpacing:.5},
  card:{borderColor:mobileDesign.border,borderWidth:1,borderRadius:23,padding:17,backgroundColor:'#fff',gap:14,
    shadowColor:mobileDesign.shadow,shadowOpacity:.045,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:2},
  cardTitle:{color:mobileDesign.ink,fontWeight:'900',fontSize:16},
  muted:{color:mobileDesign.inkMuted,fontSize:12,lineHeight:19},
  composeHeading:{flexDirection:'row',alignItems:'center',gap:11},composeHeadingText:{flex:1,gap:4},
  starters:{flexDirection:'row',flexWrap:'wrap',gap:7},starter:{borderRadius:14,borderWidth:1,borderColor:'#d4ebe0',backgroundColor:mobileDesign.mintSoft,paddingVertical:11,paddingHorizontal:12,minHeight:43,justifyContent:'center'},
  starterText:{fontSize:11,fontWeight:'800',color:mobileDesign.emerald},
  composer:{borderWidth:1,borderColor:mobileDesign.border,borderRadius:16,padding:13,fontSize:14,color:mobileDesign.ink,minHeight:116,backgroundColor:'#f8fafb'},
  composeFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  primaryButton:{backgroundColor:mobileDesign.emerald,borderRadius:15,minHeight:47,paddingHorizontal:17,alignItems:'center',justifyContent:'center'},
  primaryText:{color:'#fff',fontSize:12,fontWeight:'900'},disabled:{opacity:.5},
  secondaryButton:{borderColor:'#c5e6d5',backgroundColor:mobileDesign.mintSoft,borderWidth:1,borderRadius:15,alignItems:'center',justifyContent:'center',minHeight:47},
  secondaryText:{color:mobileDesign.emerald,fontSize:12,fontWeight:'900'},
  notice:{backgroundColor:'#fff5da',color:'#77470c',padding:14,borderRadius:15,fontSize:12,lineHeight:19},
  threadHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:7},
  sectionEyebrow:{color:mobileDesign.emerald,fontSize:9,letterSpacing:1.1,fontWeight:'900'},threadTitle:{fontSize:21,fontWeight:'900',color:mobileDesign.ink,marginTop:4},
  refresh:{minHeight:44,paddingHorizontal:13,justifyContent:'center',backgroundColor:mobileDesign.mintSoft,borderRadius:13},
  link:{color:mobileDesign.emerald,fontWeight:'900',fontSize:12},mutedLink:{color:mobileDesign.inkMuted,fontSize:12,fontWeight:'800'},
  deleteLink:{color:theme.colors.danger,fontSize:12,fontWeight:'800'},
  empty:{borderColor:mobileDesign.border,borderWidth:1,borderRadius:23,backgroundColor:'#fff',alignItems:'center',gap:12,padding:26},
  messageRow:{flexDirection:'row',gap:12},avatar:{height:45,width:45,borderRadius:16},
  avatarPlaceholder:{backgroundColor:mobileDesign.mintSoft,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:'#d9eee4'},
  avatarText:{color:mobileDesign.emerald,fontSize:16,fontWeight:'900'},messageContent:{flex:1,minWidth:0},
  author:{color:mobileDesign.ink,fontWeight:'900',fontSize:13},date:{color:mobileDesign.inkSoft,fontSize:10,marginTop:4},
  messageText:{color:mobileDesign.ink,fontSize:13,lineHeight:21,marginTop:8},actionRow:{flexDirection:'row',flexWrap:'wrap',gap:17,paddingTop:12,paddingBottom:7},
  replyBox:{backgroundColor:mobileDesign.mintSoft,borderRadius:16,padding:12,marginTop:8},
  threadReplies:{marginLeft:15,borderLeftWidth:2,borderLeftColor:'#cce6d8',paddingLeft:13,gap:6},
  replyComposer:{borderRadius:17,padding:13,backgroundColor:mobileDesign.mintSoft,gap:11},
  replyInput:{minHeight:78,borderColor:mobileDesign.border,borderWidth:1,borderRadius:13,backgroundColor:'#fff',padding:12,fontSize:13,color:mobileDesign.ink},
  loadMore:{borderWidth:1,borderColor:mobileDesign.border,borderRadius:15,minHeight:50,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},
  success:{color:mobileDesign.emerald,backgroundColor:mobileDesign.mintSoft,borderRadius:14,padding:14,fontSize:12,lineHeight:19},
  error:{color:theme.colors.danger,backgroundColor:'#fff1ef',borderRadius:14,padding:14,fontSize:12,lineHeight:19},
})
