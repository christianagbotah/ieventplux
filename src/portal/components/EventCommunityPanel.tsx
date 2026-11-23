'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageCircle, MessagesSquare, Reply, Send, ShieldCheck, Trash2, Users, RefreshCw, ChevronDown, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ui/confirm-dialog-provider'
import { api, ApiClientError } from '../api'
import { initials, relative } from '../format'
import { navigate } from '../router'
import { usePortal } from '../store'

type ThreadComment = {
  id: string
  body: string
  createdAt: string
  user: { id: string; displayName: string; avatarUrl?: string | null }
  children: ThreadComment[]
  _count?: { children: number }
}
type ThreadPage = { items: ThreadComment[]; page: number; pageSize: number; total: number; hasMore: boolean }

const SUGGESTIONS = [
  { label: 'Introduce yourself', text: 'Hello everyone! I am joining this event because ' },
  { label: 'Ask a question', text: 'Question for the organizer: ' },
  { label: 'Share a tip', text: 'A useful tip for fellow attendees: ' },
] as const

export function EventCommunityPanel({ eventId, canManage, status, visibility }: {
  eventId: string
  canManage: boolean
  status: string
  visibility: string
}) {
  const { user } = usePortal()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [threads, setThreads] = useState<ThreadComment[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState('')
  const [restricted, setRestricted] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])

  const load = useCallback(async (targetPage = 1) => {
    if (targetPage === 1) setLoading(true)
    else setMoreLoading(true)
    try {
      const data = await api.get<ThreadPage>(`/events/${eventId}/comments?page=${targetPage}&pageSize=12`)
      setThreads((previous) => {
        if (targetPage === 1) return data.items
        const seen = new Set(previous.map((item) => item.id))
        return [...previous, ...data.items.filter((item) => !seen.has(item.id))]
      })
      setPage(targetPage)
      setTotal(data.total)
      setRestricted(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403 || err.status === 404)) {
        setRestricted(true)
        setError('')
        setThreads([])
      } else {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load the community.')
      }
    } finally {
      setLoading(false)
      setMoreLoading(false)
    }
  }, [eventId])

  useEffect(() => { void load() }, [load, user?.id])

  const readOnly = status === 'CANCELLED' || !['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'].includes(status)
  const post = async (parentId?: string) => {
    if (!user) return navigate('/signin')
    if (posting || readOnly || restricted) return
    const body = parentId ? replyText.trim() : draft.trim()
    if (body.length < 2 || body.length > 1000) return
    setPosting(true)
    try {
      await api.post(`/events/${eventId}/comments`, { body, ...(parentId ? { parentId } : {}) })
      setReplyingTo(null)
      setReplyText('')
      setDraft('')
      await load(1)
      toast({ title: parentId ? 'Reply posted' : 'Community post published', description: 'Your message is now part of this event conversation.' })
    } catch (err) {
      toast({ title: 'Could not publish', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally { setPosting(false) }
  }

  const remove = async (commentId: string, author: string) => {
    if (!user) return
    const accepted = await confirm({
      title: 'Remove this community message?',
      description: `The message by ${author} will no longer appear to participants. This cannot be undone from the event page.`,
      confirmLabel: 'Remove message', tone: 'danger',
    })
    if (!accepted) return
    try {
      await api.post(`/comments/${commentId}`, {})
      await load(1)
      toast({ description: 'The message has been removed.' })
    } catch (err) {
      toast({ title: 'Unable to remove message', description: err instanceof ApiClientError ? err.message : 'Please retry.', variant: 'destructive' })
    }
  }

  const report = async (id: string) => {
    if (!user) return navigate('/signin')
    const accepted = await confirm({
      title: 'Report this community message?',
      description: 'Your report is sent to the moderation team for review. Reporting a post does not automatically remove it.',
      confirmLabel: 'Submit report', tone: 'warning',
    })
    if (!accepted) return
    try {
      await api.post('/social/report', { targetType: 'COMMENT', targetId: id, reason: 'OTHER' })
      toast({ title: 'Report submitted', description: 'Thank you. The moderation team can review this message.' })
    } catch (err) {
      toast({ title: 'Report failed', description: err instanceof ApiClientError ? err.message : 'Try again later.', variant: 'destructive' })
    }
  }

  const message = (comment: ThreadComment, nested = false) => <div key={comment.id}
    className={'flex min-w-0 gap-3 ' + (nested ? 'rounded-xl border border-border/45 bg-secondary/30 p-3' : '')}>
    <Avatar className="size-9 shrink-0">
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(comment.user.displayName)}</AvatarFallback>
    </Avatar>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="max-w-full truncate font-bold">{comment.user.displayName}</span>
        <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">{relative(comment.createdAt)}</time>
      </div>
      <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-foreground/85">{comment.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!nested && user && !readOnly && <button type="button"
          onClick={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText('') }}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <Reply className="size-4" aria-hidden /> Reply
        </button>}
        {user && user.id !== comment.user.id && <button type="button"
          onClick={() => void report(comment.id)}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-600">
          <Flag className="size-3.5" aria-hidden /> Report
        </button>}
        {(canManage || user?.id === comment.user.id) && !readOnly && <button type="button"
          onClick={() => void remove(comment.id, comment.user.displayName)}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" aria-hidden /> Remove
        </button>}
      </div>
    </div>
  </div>

  return <div className="space-y-5">
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Users className="size-5" aria-hidden /></span>
        <div>
          <p className="text-sm font-bold">Your event community</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Meet fellow attendees, ask questions and exchange helpful ideas. Posts are visible to everyone allowed into this event discussion.
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {visibility === 'INVITE_ONLY' ? 'Approved invitees, valid ticket holders and event organizers only' : 'Event participants and visitors who can access this event'}
      </p>
    </div>

    {restricted ? <div role="status" className="rounded-2xl border bg-secondary/40 p-5 text-sm">
      <p className="font-semibold">This community is private.</p>
      <p className="mt-2 text-muted-foreground">Only invited and approved attendees or valid ticket holders can view and join this conversation.</p>
      {!user && <Button variant="outline" className="mt-3 min-h-11" onClick={() => navigate('/signin')}>Sign in</Button>}
    </div> : <>
      {readOnly && <p role="status" className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">This community is currently read-only. Previous conversations remain available.</p>}
      {!readOnly && (user ? <form onSubmit={(event) => { event.preventDefault(); void post() }} className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Conversation starters">
          {SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion.label}
            onClick={() => setDraft(suggestion.text)}
            className="min-h-9 rounded-full border border-border/80 bg-background px-3 text-xs font-semibold transition hover:border-primary hover:text-primary">
            {suggestion.label}
          </button>)}
        </div>
        <label className="block text-sm font-semibold" htmlFor="event-community-message">Share with your event community</label>
        <Textarea id="event-community-message" value={draft} onChange={(event) => setDraft(event.target.value)}
          maxLength={1000} rows={3} placeholder="Introduce yourself, ask a question or share a helpful idea…" className="min-h-24 resize-y rounded-xl" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{draft.length}/1,000 characters</span>
          <Button type="submit" className="min-h-11 rounded-xl" disabled={posting || draft.trim().length < 2}>
            {posting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Publish post
          </Button>
        </div>
      </form> : <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm">
        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/signin')}>Sign in</button> to join this conversation.
      </p>)}

      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold"><MessagesSquare className="size-4 text-primary" aria-hidden /> Conversations {total > 0 ? `(${total})` : ''}</h3>
        <Button size="sm" variant="ghost" className="min-h-10" onClick={() => void load(1)} disabled={loading || posting}>
          <RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} aria-hidden /> Refresh
        </Button>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 p-4 text-sm">
        <span>{error}</span><Button size="sm" variant="outline" onClick={() => void load(1)}>Retry</Button>
      </div>}
      {loading && !threads.length ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading conversations…</div>
        : threads.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center">
          <MessageCircle className="mx-auto mb-3 size-8 text-primary/60" aria-hidden />
          <p className="text-sm font-semibold">Start the first conversation</p>
          <p className="mt-1 text-xs text-muted-foreground">An introduction or useful question helps everyone feel welcome.</p>
        </div> : <div className="space-y-3">
          {threads.map((thread) => {
            const totalReplies = thread._count?.children ?? thread.children?.length ?? 0
            const showAll = expanded.includes(thread.id)
            const shown = showAll ? thread.children : thread.children?.slice(0, 2)
            return <article key={thread.id} className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              {message(thread)}
              {totalReplies > 0 && <div className="ml-4 border-l-2 border-primary/15 pl-3 sm:ml-8 sm:pl-4">
                <button type="button" className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  onClick={() => setExpanded((prev) => prev.includes(thread.id) ? prev.filter((id) => id !== thread.id) : [...prev, thread.id])}>
                  <MessageCircle className="size-4" aria-hidden />
                  {showAll ? 'Show fewer replies' : `View ${totalReplies} ${totalReplies === 1 ? 'reply' : 'replies'}`}
                  <ChevronDown className={'size-3.5 transition-transform ' + (showAll ? 'rotate-180' : '')} aria-hidden />
                </button>
                <div className="space-y-2">{shown?.map((reply) => message(reply, true))}</div>
                {showAll && totalReplies > thread.children.length && <p className="mt-2 text-xs text-muted-foreground">Showing the first 40 replies. Older replies are not yet loaded.</p>}
              </div>}
              {replyingTo === thread.id && !readOnly && user && <form
                onSubmit={(event) => { event.preventDefault(); void post(thread.id) }}
                className="ml-0 space-y-2 rounded-xl border border-primary/25 bg-secondary/30 p-3 sm:ml-8">
                <label htmlFor={`reply-${thread.id}`} className="text-xs font-bold">Reply to {thread.user.displayName}</label>
                <Textarea id={`reply-${thread.id}`} value={replyText} onChange={(event) => setReplyText(event.target.value)}
                  maxLength={1000} rows={2} placeholder="Write a helpful reply…" className="min-h-20" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setReplyingTo(null)}>Cancel</Button>
                  <Button type="submit" size="sm" className="min-h-10" disabled={posting || replyText.trim().length < 2}>Post reply</Button>
                </div>
              </form>}
            </article>
          })}
          {threads.length < total && <div className="text-center">
            <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={moreLoading}
              onClick={() => void load(page + 1)}>
              {moreLoading ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />} Load older conversations
            </Button>
          </div>}
        </div>}
    </>}
  </div>
}
