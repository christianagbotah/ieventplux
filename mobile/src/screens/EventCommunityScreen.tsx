/**
 * First-class native event community, using the same moderated server API as
 * the web. No separate message store and no offline replay of private posts.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native'
import { api, ApiClientError, type CommunityComment } from '../api/client'
import { ActionDialog, type ActionPrompt } from '../components/ActionDialog'
import {
  communityCanPost, communityUnavailableStatus, mergeCommunityThreads, validCommunityPost,
} from '../lib/event-social-policy'
import { useSession } from '../store/session'
import { theme } from '../theme'
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
  const [draft, setDraft] = useState('')
  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const load = useCallback(async (targetPage: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const response = await api.community.list(eventId, targetPage)
      setItems((current) => mergeCommunityThreads(current, response, append))
      setPage(targetPage)
      setTotal(response.total)
      setInaccessible(false)
      setError('')
    } catch (reason) {
      if (reason instanceof ApiClientError && communityUnavailableStatus(reason.status)) {
        setItems([])
        setInaccessible(true)
        setError('')
      } else {
        setError(reason instanceof ApiClientError ? reason.message : 'Unable to load conversations.')
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [eventId])

  useEffect(() => { void load(1) }, [load])

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
      setError(parentId ? 'Reply posted successfully.' : 'Conversation published successfully.')
    } catch (reason) {
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
            setError(isRemoval ? 'Message removed.' : 'Report sent to moderators.')
          } catch (reason) {
            setError(reason instanceof ApiClientError ? reason.message : 'Could not complete this action.')
          } finally { setActionBusy(false); setPrompt(null) }
        })()
      },
    })
  }

  const commentRow = (comment: CommunityComment, nested: boolean) =>
    <View key={comment.id} style={[styles.messageRow, nested && styles.replyBox]}>
      {comment.user.avatarUrl ? <Image source={{ uri: comment.user.avatarUrl }} style={styles.avatar} /> :
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
        <Text style={styles.eyebrow}>EVENT COMMUNITY</Text>
        <Text style={styles.title}>Join the conversation</Text>
        <Text style={styles.heroDescription} numberOfLines={3}>{eventTitle}</Text>
        <Text style={styles.heroNote}>Introduce yourself, ask questions and connect with other people around this event.</Text>
      </View>
      {inaccessible ? <View style={styles.card}>
        <Text style={styles.cardTitle}>This community is private</Text>
        <Text style={styles.muted}>Only participants with appropriate event access can view these conversations.</Text>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void load(1)}>
          <Text style={styles.secondaryText}>Check access again</Text>
        </Pressable>
      </View> : <>
        {!canPost ? <Text style={styles.notice}>This event discussion is read-only.</Text> : <View style={styles.card}>
          <Text style={styles.cardTitle}>Share something helpful</Text>
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
          <Text style={styles.cardTitle}>Conversations {total > 0 ? '(' + total + ')' : ''}</Text>
          <Pressable accessibilityRole="button" style={styles.refresh} onPress={() => void load(1)}>
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        </View>
        {loading && items.length === 0 ? <ActivityIndicator size="large" color={theme.colors.primary} /> :
          items.length === 0 ? <View style={styles.empty}>
            <Text style={styles.cardTitle}>No conversations yet</Text>
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
      {error ? <Text accessibilityRole="alert" style={styles.feedback}>{error}</Text> : null}
    </ScrollView>
    <ActionDialog prompt={prompt} onDismiss={() => setPrompt(null)} busy={actionBusy} />
  </View>
}

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor:theme.colors.bg },
  content: { padding:16, gap:14, paddingBottom:45 },
  hero: { backgroundColor:theme.colors.primaryDark, borderRadius:22, padding:20, gap:9 },
  eyebrow: { color:'#9defc9', letterSpacing:2, fontSize:10, fontWeight:'800' },
  title: { color:'#ffffff', fontSize:23, fontWeight:'800' },
  heroDescription: { color:'#e0fff2', fontWeight:'700', fontSize:13 },
  heroNote: { color:'#bde8d4', fontSize:12, lineHeight:19 },
  card: { borderColor:theme.colors.border, borderWidth:1, borderRadius:18, padding:16,
    backgroundColor:theme.colors.card, gap:13 },
  cardTitle: { color:theme.colors.text, fontWeight:'800', fontSize:16 },
  muted: { color:theme.colors.textMuted, fontSize:12, lineHeight:19 },
  starters: { flexDirection:'row', flexWrap:'wrap', gap:7 },
  starter: { borderRadius:40, borderWidth:1, borderColor:theme.colors.border, paddingVertical:9, paddingHorizontal:11 },
  starterText: { fontSize:11, fontWeight:'700', color:theme.colors.primaryDark },
  composer: { borderWidth:1, borderColor:theme.colors.border, borderRadius:12, padding:12,
    fontSize:14, color:theme.colors.text, minHeight:105, backgroundColor:'#fcfefd' },
  composeFooter: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:10 },
  primaryButton: { backgroundColor:theme.colors.primary, borderRadius:12, minHeight:44, paddingHorizontal:15,
    alignItems:'center', justifyContent:'center' },
  primaryText: { color:'#ffffff', fontSize:13, fontWeight:'800' },
  disabled: { opacity:0.45 },
  secondaryButton: { borderColor:theme.colors.primary, borderWidth:1, borderRadius:12,
    alignItems:'center', justifyContent:'center', minHeight:44 },
  secondaryText: { color:theme.colors.primary, fontSize:13, fontWeight:'800' },
  notice: { backgroundColor:'#fff5da', color:'#77470c', padding:12, borderRadius:12, fontSize:12 },
  threadHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:7 },
  refresh: { minHeight:42, paddingHorizontal:9, justifyContent:'center' },
  link: { color:theme.colors.primary, fontWeight:'800', fontSize:12 },
  mutedLink: { color:theme.colors.textMuted, fontSize:12, fontWeight:'700' },
  deleteLink: { color:theme.colors.danger, fontSize:12, fontWeight:'700' },
  empty: { borderColor:theme.colors.border, borderWidth:1, borderStyle:'dashed', borderRadius:18,
    alignItems:'center', gap:6, padding:24 },
  messageRow: { flexDirection:'row', gap:10 },
  avatar: { height:38, width:38, borderRadius:19 },
  avatarPlaceholder: { backgroundColor:'#d7f2e5', justifyContent:'center', alignItems:'center' },
  avatarText: { color:theme.colors.primaryDark, fontWeight:'800' },
  messageContent: { flex:1, minWidth:0 },
  author: { color:theme.colors.text, fontWeight:'800', fontSize:13 },
  date: { color:theme.colors.textMuted, fontSize:10, marginTop:2 },
  messageText: { color:theme.colors.text, fontSize:13, lineHeight:20, marginTop:6 },
  actionRow: { flexDirection:'row', flexWrap:'wrap', gap:17, paddingVertical:10 },
  replyBox: { backgroundColor:'#f1f8f4', borderRadius:13, padding:10, marginTop:8 },
  threadReplies: { marginLeft:16, borderLeftWidth:2, borderLeftColor:'#cce6d8',
    paddingLeft:13, gap:4 },
  replyComposer: { borderRadius:12, padding:10, backgroundColor:'#f1f8f4', gap:10 },
  replyInput: { minHeight:72, borderColor:theme.colors.border, borderWidth:1,
    borderRadius:10, backgroundColor:'#ffffff', padding:11, fontSize:13, color:theme.colors.text },
  loadMore: { borderWidth:1, borderColor:theme.colors.border, borderRadius:14,
    minHeight:48, alignItems:'center', justifyContent:'center' },
  feedback: { color:theme.colors.primaryDark, backgroundColor:'#e6f8eb', borderRadius:10,
    padding:12, fontSize:12, lineHeight:18 },
})
