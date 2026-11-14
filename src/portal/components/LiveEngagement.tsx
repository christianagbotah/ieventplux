'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { connectRealtime } from '../realtime'
import {
  BarChart3, MessageCircleQuestion, Send, ChevronUp, Pin, EyeOff, Eye, Check,
  Loader2, Plus, X, Radio, ShieldCheck, Vote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { relative } from '../format'
import { useToast } from '@/hooks/use-toast'

/**
 * Live engagement: realtime polls + audience Q&A on the event page.
 * Durable state comes from the API; the :3003 relay pushes deltas into the
 * `event:{id}` room. When the relay is unavailable the panel keeps working —
 * it simply refetches.
 */

interface PollOption {
  id: string
  text: string
  position: number
  votes: number
}

interface Poll {
  id: string
  eventId: string
  question: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  totalVotes: number
  myOptionId: string | null
  options: PollOption[]
}

interface Question {
  id: string
  body: string
  status: 'NEW' | 'ANSWERED' | 'HIDDEN'
  answer: string | null
  answeredAt: string | null
  pinned: boolean
  createdAt: string
  author: { id: string; displayName: string }
  upvotes: number
  myUpvote: boolean
  isMine: boolean
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function LiveEngagement({ eventId, slug, live }: { eventId: string; slug: string; live: boolean }) {
  const { user } = usePortal()
  const { toast } = useToast()

  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [isOrg, setIsOrg] = useState(false)
  const [votingOption, setVotingOption] = useState<string | null>(null)
  const [askDraft, setAskDraft] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [upvoting, setUpvoting] = useState<string | null>(null)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [composerOpen, setComposerOpen] = useState(false)
  const [composer, setComposer] = useState({ question: '', options: ['', ''] })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [pollsPayload, questionsPayload] = await Promise.all([
      api.get<{ polls: Poll[]; isOrg: boolean }>(`/events/${eventId}/polls`).catch(() => null),
      api.get<{ questions: Question[]; isOrg: boolean }>(`/events/${eventId}/questions`).catch(() => null),
    ])
    if (pollsPayload) {
      setPolls(pollsPayload.polls)
      setIsOrg(pollsPayload.isOrg)
    }
    if (questionsPayload) setQuestions(questionsPayload.questions)
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  // Realtime deltas from the event room (best-effort; load() is the fallback).
  useEffect(() => {
    const socket = connectRealtime()
    socket.on('connect', () => socket.emit('join', { room: `event:${eventId}` }))

    socket.on('poll:update', ({ poll }: { poll: Poll }) => {
      // Replace wholesale but preserve this viewer's own vote marker — the
      // broadcast is room-wide, so the server cannot include per-viewer fields.
      setPolls((prev) => (prev ? (prev.some((p) => p.id === poll.id) ? prev.map((p) => (p.id === poll.id ? { ...poll, myOptionId: p.myOptionId ?? poll.myOptionId } : p)) : [poll, ...prev]) : [poll]))
    })
    socket.on('poll:closed-others', ({ exceptPollId }: { exceptPollId: string }) => {
      setPolls((prev) => prev?.map((p) => (p.id !== exceptPollId && p.status === 'OPEN' ? { ...p, status: 'CLOSED' as const } : p)) ?? prev)
    })
    socket.on('poll:vote', ({ pollId, tallies }: { pollId: string; tallies: { options: PollOption[]; totalVotes: number } }) => {
      setPolls((prev) => prev?.map((p) => (p.id === pollId ? { ...p, options: tallies.options, totalVotes: tallies.totalVotes } : p)) ?? prev)
    })
    socket.on('qa:new', ({ question }: { question: Question }) => {
      setQuestions((prev) => (prev?.some((q) => q.id === question.id) ? prev : [question, ...(prev ?? [])]))
    })
    socket.on('qa:update', ({ question }: { question: Question }) => {
      setQuestions((prev) => {
        if (!prev) return prev
        if (question.status === 'HIDDEN' && !isOrg) return prev.filter((q) => q.id !== question.id)
        // Preserve this viewer's own upvote/ownership markers on replace.
        return prev.some((q) => q.id === question.id)
          ? prev.map((q) => (q.id === question.id ? { ...question, myUpvote: q.myUpvote, isMine: q.isMine } : q))
          : [question, ...prev]
      })
    })
    socket.on('qa:upvote', ({ questionId, upvotes }: { questionId: string; upvotes: number }) => {
      setQuestions((prev) => prev?.map((q) => (q.id === questionId ? { ...q, upvotes } : q)) ?? prev)
    })
    return () => {
      socket.disconnect()
    }
  }, [eventId, isOrg])

  // Resilience: if the relay is unreachable or a socket drops without a
  // reconnect (some proxies strip websocket upgrades), this light refetch
  // keeps the panel honest while the event is live.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => void load(), 30_000)
    return () => clearInterval(timer)
  }, [live, load])

  const openPoll = useMemo(() => polls?.find((p) => p.status === 'OPEN') ?? null, [polls])
  const closedPolls = useMemo(() => polls?.filter((p) => p.status === 'CLOSED') ?? [], [polls])
  const draftPolls = useMemo(() => polls?.filter((p) => p.status === 'DRAFT') ?? [], [polls])
  const visibleQuestions = useMemo(
    () => (questions ?? []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.status === 'ANSWERED' ? 1 : 0) - (b.status === 'ANSWERED' ? 1 : 0) || b.upvotes - a.upvotes || a.createdAt.localeCompare(b.createdAt)),
    [questions]
  )

  // Self-hide: nothing to show for ended/quiet events unless the organizer is here.
  if (polls === null || questions === null) {
    return (
      <Card className="rounded-2xl" aria-busy="true">
        <CardContent className="p-5">
          <div className="ievx-skeleton h-4 w-40 rounded-full" />
          <div className="mt-3 ievx-skeleton h-9 w-full rounded-xl" />
          <div className="mt-2 ievx-skeleton h-9 w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }
  if (!live && !isOrg && polls.length === 0 && questions.length === 0) return null

  const vote = async (poll: Poll, option: PollOption) => {
    if (!user) return navigate('/signin')
    setVotingOption(option.id)
    try {
      const result = await api.post<{ tallies: { options: PollOption[]; totalVotes: number }; myOptionId: string }>(`/polls/${poll.id}/vote`, { optionId: option.id })
      setPolls((prev) => prev?.map((p) => (p.id === poll.id ? { ...p, options: result.tallies.options, totalVotes: result.tallies.totalVotes, myOptionId: result.myOptionId } : p)) ?? prev)
      toast({ description: 'Vote counted.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Vote failed.', variant: 'destructive' })
    } finally {
      setVotingOption(null)
    }
  }

  const ask = async () => {
    if (!user) return navigate('/signin')
    if (askDraft.trim().length < 6) return
    setAskBusy(true)
    try {
      const result = await api.post<{ question: Question }>(`/events/${eventId}/questions`, { body: askDraft })
      setQuestions((prev) => (prev?.some((q) => q.id === result.question.id) ? prev : [result.question, ...(prev ?? [])]))
      setAskDraft('')
      toast({ description: 'Question sent to the organizers.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not send the question.', variant: 'destructive' })
    } finally {
      setAskBusy(false)
    }
  }

  const upvote = async (question: Question) => {
    if (!user) return navigate('/signin')
    setUpvoting(question.id)
    try {
      const result = await api.post<{ upvoted: boolean; upvotes: number }>(`/questions/${question.id}/upvote`)
      setQuestions((prev) => prev?.map((q) => (q.id === question.id ? { ...q, myUpvote: result.upvoted, upvotes: result.upvotes } : q)) ?? prev)
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not upvote.', variant: 'destructive' })
    } finally {
      setUpvoting(null)
    }
  }

  const createPoll = async () => {
    setCreating(true)
    try {
      const result = await api.post<{ poll: Poll }>(`/events/${eventId}/polls`, {
        question: composer.question,
        options: composer.options.map((o) => o.trim()).filter(Boolean),
      })
      setPolls((prev) => [...(prev ?? []), result.poll])
      setComposer({ question: '', options: ['', ''] })
      setComposerOpen(false)
      toast({ title: 'Poll drafted', description: 'Open it while the event is live to start collecting votes.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not create the poll.', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const setPollLive = async (poll: Poll, to: 'OPEN' | 'CLOSED') => {
    try {
      await api.post(`/polls/${poll.id}/${to === 'OPEN' ? 'open' : 'close'}`)
      await load() // statuses re-sorted server-side (opening auto-closes siblings)
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Poll status change failed.', variant: 'destructive' })
    }
  }

  const moderate = async (question: Question, action: 'answer' | 'hide' | 'unhide' | 'pin' | 'unpin', answer?: string) => {
    try {
      const result = await api.post<{ question: Question }>(`/questions/${question.id}/${action}`, action === 'answer' ? { answer } : undefined)
      setQuestions((prev) => {
        const next = prev?.map((q) => (q.id === question.id ? { ...result.question, myUpvote: q.myUpvote } : q)) ?? null
        return action === 'hide' && next ? next.filter((q) => q.id !== question.id) : next
      })
      if (action === 'answer') setAnswerDrafts((d) => ({ ...d, [question.id]: '' }))
      toast({ description: action === 'answer' ? 'Answer published live.' : `Question ${action === 'unpin' ? 'unpinned' : action === 'unhide' ? 'restored' : action + 'd'}.` })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
    }
  }

  return (
    <Card className="ievx-glass overflow-hidden rounded-2xl" id="live-engagement">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            {live ? (
              <span className="efx-badge-ping relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive" aria-hidden>
                <Radio className="h-4.5 w-4.5" />
                <span className="efx-badge-ping__dot" />
              </span>
            ) : (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
                <BarChart3 className="h-4.5 w-4.5" />
              </span>
            )}
            Live engagement
            {live && (
              <Badge className="gap-1.5 bg-destructive text-white">
                <span className="ievx-live-dot" /> Live
              </Badge>
            )}
          </CardTitle>
          {isOrg && (
            <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Organizer controls
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={live && (openPoll || polls.length === 0) ? 'poll' : 'qa'}>
          <TabsList className="mb-3 rounded-full p-1">
            <TabsTrigger value="poll" className="rounded-full px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Vote className="mr-1.5 h-4 w-4" /> Live poll
            </TabsTrigger>
            <TabsTrigger value="qa" className="rounded-full px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageCircleQuestion className="mr-1.5 h-4 w-4" /> Q&amp;A
            </TabsTrigger>
          </TabsList>

          {/* ── Polls tab ── */}
          <TabsContent value="poll" className="mt-0 space-y-4">
            {isOrg && <OrgPollComposer open={composerOpen} setOpen={setComposerOpen} composer={composer} setComposer={setComposer} creating={creating} live={live} create={createPoll} />}

            {openPoll ? (
              <PollCard poll={openPoll} isOrg={isOrg} votingOption={votingOption} onVote={vote} onSetLive={setPollLive} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-8 text-center">
                <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
                <p className="mt-2 text-sm font-medium">{live ? 'No poll is open right now' : 'Polls open once the event is live'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {live ? 'The organizers will push the next question here — results update in realtime.' : 'When this event goes live, the organizers can open polls this audience votes on in one tap.'}
                </p>
              </div>
            )}

            {(draftPolls.length > 0 || closedPolls.length > 0) && (
              <div className="space-y-3">
                {isOrg && draftPolls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} isOrg={isOrg} votingOption={null} onVote={() => undefined} onSetLive={setPollLive} />
                ))}
                {closedPolls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} isOrg={isOrg} votingOption={votingOption} onVote={vote} onSetLive={setPollLive} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Q&A tab ── */}
          <TabsContent value="qa" className="mt-0 space-y-4">
            {user ? (
              <div className="space-y-2">
                <Label htmlFor="qa-draft" className="text-xs font-medium text-muted-foreground">
                  Ask the organizers — the most upvoted questions get answered live.
                </Label>
                <Textarea
                  id="qa-draft"
                  value={askDraft}
                  onChange={(e) => setAskDraft(e.target.value.slice(0, 280))}
                  placeholder="e.g. Will the VIP block have its own parking?"
                  className="min-h-[76px] rounded-xl"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground" aria-live="polite">{askDraft.length}/280</span>
                  <Button size="sm" className="rounded-full ievx-press" disabled={askBusy || askDraft.trim().length < 6} onClick={() => void ask()}>
                    {askBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                    Send question
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4">
                <p className="text-sm text-muted-foreground">Sign in to ask a question and upvote the ones you want answered.</p>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate('/signin')}>Sign in</Button>
              </div>
            )}

            {visibleQuestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-8 text-center">
                <MessageCircleQuestion className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
                <p className="mt-2 text-sm font-medium">No questions yet</p>
                <p className="mt-1 text-xs text-muted-foreground">{live ? 'Be the first — the organizers answer live from the stage.' : 'Early questions land at the top when the event starts.'}</p>
              </div>
            ) : (
              <ul className="space-y-2.5" aria-label="Audience questions">
                {visibleQuestions.map((question) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    isOrg={isOrg}
                    upvoting={upvoting === question.id}
                    onUpvote={() => void upvote(question)}
                    answerDraft={answerDrafts[question.id] ?? ''}
                    setAnswerDraft={(v) => setAnswerDrafts((d) => ({ ...d, [question.id]: v }))}
                    onAnswer={() => void moderate(question, 'answer', answerDrafts[question.id])}
                    onModerate={(action) => void moderate(question, action)}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────────── Poll card (attendee + org states) ───────────────────────────── */

function PollCard({ poll, isOrg, votingOption, onVote, onSetLive }: {
  poll: Poll
  isOrg: boolean
  votingOption: string | null
  onVote: (poll: Poll, option: PollOption) => void
  onSetLive: (poll: Poll, to: 'OPEN' | 'CLOSED') => Promise<void>
}) {
  const voted = Boolean(poll.myOptionId)
  const revealed = voted || poll.status !== 'OPEN' || isOrg // vote to unlock live results; organizers always see them
  const leader = poll.options.reduce((best, o) => (o.votes > best.votes ? o : best), poll.options[0])
  const runnerUp = poll.options.filter((o) => o.id !== leader.id).reduce((max, o) => Math.max(max, o.votes), 0)
  const showLeading = revealed && poll.totalVotes > 0 && runnerUp > 0 // redundant when only one option has any votes

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 ievx-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-bold leading-snug">{poll.question}</h3>
        <div className="flex items-center gap-2">
          {poll.status === 'OPEN' && <Badge className="bg-destructive text-white"><span className="ievx-live-dot" /> Open</Badge>}
          {poll.status === 'CLOSED' && <Badge variant="secondary">Closed</Badge>}
          {poll.status === 'DRAFT' && <Badge variant="outline">Draft</Badge>}
          {isOrg && poll.status === 'DRAFT' && (
            <Button size="sm" className="rounded-full efx-shine-sweep-button px-4" onClick={() => void onSetLive(poll, 'OPEN')}>
              Open poll
            </Button>
          )}
          {isOrg && poll.status === 'OPEN' && (
            <Button size="sm" variant="outline" className="rounded-full ievx-press" onClick={() => void onSetLive(poll, 'CLOSED')}>
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2" role={poll.status === 'OPEN' && !voted ? 'radiogroup' : undefined} aria-label="Poll options">
        {poll.options.map((option, index) => {
          const isMine = poll.myOptionId === option.id
          const isLeader = revealed && showLeading && option.id === leader.id
          const pct = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0

          if (!revealed) {
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={false}
                disabled={votingOption !== null}
                onClick={() => onVote(poll, option)}
                className="ievx-press group flex w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                  {LETTERS[index] ?? index + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{option.text}</span>
                {votingOption === option.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Vote className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary" aria-hidden />}
              </button>
            )
          }

          return (
            <div key={option.id} className={`rounded-xl border px-4 py-3 ${isMine ? 'border-primary/60 bg-primary/5' : isLeader ? 'border-accent/50' : 'border-border/60'}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`} aria-hidden>
                    {LETTERS[index] ?? index + 1}
                  </span>
                  {option.text}
                  {isMine && <Check className="h-3.5 w-3.5 text-primary" aria-label="Your vote" />}
                  {isLeader && <Badge className="bg-accent text-accent-foreground text-[10px] leading-none">Leading</Badge>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground" aria-label={`${option.votes} votes — ${pct}%`}>
                  {option.votes} · {pct}%
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${option.text}: ${pct}%`}>
                <div
                  className={`ievx-poll-fill h-full rounded-full bg-gradient-to-r ${isLeader ? 'from-accent via-amber-500 to-primary' : 'from-primary to-emerald-500'} ${isLeader ? 'ievx-poll-fill--lead' : ''}`}
                  style={{ width: `${Math.max(poll.totalVotes > 0 ? 4 : 0, pct)}%`, transition: 'width .5s cubic-bezier(.22,.8,.32,1)' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {poll.status === 'OPEN'
          ? voted ? `${poll.totalVotes} vote${poll.totalVotes === 1 ? '' : 's'} so far · results update live` : `${poll.totalVotes} vote${poll.totalVotes === 1 ? '' : 's'} so far · vote to see live results`
          : `Final result · ${poll.totalVotes} vote${poll.totalVotes === 1 ? '' : 's'}${poll.closedAt ? ` · closed ${relative(poll.closedAt)}` : ''}`}
        {poll.totalVotes === 0 && poll.status === 'OPEN' && ' · be the first to vote'}
      </p>
    </div>
  )
}

/* ───────────────────────────── Organizer composer ───────────────────────────── */

function OrgPollComposer({ open, setOpen, composer, setComposer, creating, live, create }: {
  open: boolean
  setOpen: (v: boolean) => void
  composer: { question: string; options: string[] }
  setComposer: (v: { question: string; options: string[] }) => void
  creating: boolean
  live: boolean
  create: () => Promise<void>
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ievx-press flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" aria-hidden /> Create a live poll
      </button>
    )
  }

  const setOption = (index: number, value: string) => {
    const next = [...composer.options]
    next[index] = value
    setComposer({ ...composer, options: next })
  }
  const removeOption = (index: number) => {
    if (composer.options.length <= 2) return
    setComposer({ ...composer, options: composer.options.filter((_, i) => i !== index) })
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">New poll</Label>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Close composer" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor="poll-question" className="text-xs text-muted-foreground">Question</Label>
          <Input id="poll-question" className="mt-1 rounded-xl" value={composer.question} placeholder="e.g. What should the next worship flow be?" onChange={(e) => setComposer({ ...composer, question: e.target.value.slice(0, 140) })} />
        </div>
        <div className="space-y-2">
          {composer.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold" aria-hidden>{LETTERS[index] ?? index + 1}</span>
              <Input className="rounded-xl" value={option} placeholder={`Option ${index + 1}`} onChange={(e) => setOption(index, e.target.value.slice(0, 40))} aria-label={`Option ${index + 1}`} />
              <Button variant="ghost" size="icon" className="rounded-full" disabled={composer.options.length <= 2} aria-label={`Remove option ${index + 1}`} onClick={() => removeOption(index)}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {composer.options.length < 6 && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setComposer({ ...composer, options: [...composer.options, ''] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add option
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{live ? 'You can open it immediately after creating.' : 'It will be openable once the event is live.'}</p>
          <Button size="sm" className="rounded-full ievx-press" disabled={creating || composer.question.trim().length < 4 || composer.options.filter((o) => o.trim()).length < 2} onClick={() => void create()}>
            {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />} Create poll
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Question row ───────────────────────────── */

function QuestionRow({ question, isOrg, upvoting, onUpvote, answerDraft, setAnswerDraft, onAnswer, onModerate }: {
  question: Question
  isOrg: boolean
  upvoting: boolean
  onUpvote: () => void
  answerDraft: string
  setAnswerDraft: (v: string) => void
  onAnswer: () => void
  onModerate: (action: 'hide' | 'unhide' | 'pin' | 'unpin') => void
}) {
  const answered = question.status === 'ANSWERED' && question.answer
  return (
    <li className={`ievx-msg-in rounded-2xl border bg-card p-4 ${question.pinned ? 'border-accent/50' : question.status === 'HIDDEN' ? 'border-border/50 opacity-70' : 'border-border/70'}`}>
      <div className="flex items-start gap-3">
        <div className="flex w-12 shrink-0 flex-col items-center">
          <button
            type="button"
            onClick={onUpvote}
            disabled={upvoting || question.isMine}
            aria-label={question.isMine ? 'Own question — upvoting disabled' : question.myUpvote ? 'Remove upvote' : 'Upvote this question'}
            aria-pressed={question.myUpvote}
            className={`ievx-press inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${question.myUpvote ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50 hover:text-primary'} disabled:opacity-50`}
          >
            {upvoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronUp className="h-5 w-5" />}
          </button>
          <span className="mt-1 text-sm font-bold tabular-nums" aria-live="polite">{question.upvotes}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {question.pinned && <Badge className="gap-1 bg-accent text-accent-foreground"><Pin className="h-3 w-3" /> Pinned</Badge>}
            {answered && <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><Check className="h-3 w-3" /> Answered</Badge>}
            {question.status === 'HIDDEN' && <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" /> Hidden</Badge>}
          </div>
          <p className={`mt-1.5 text-sm ${question.status === 'HIDDEN' ? 'line-through decoration-border' : ''}`}>{question.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {question.author.displayName} · {relative(question.createdAt)}
            {question.isMine && ' · your question'}
          </p>

          {answered && (
            <div className="mt-3 rounded-xl border-l-2 border-primary bg-primary/5 p-3.5">
              <p className="text-sm">{question.answer}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                Answered by the organizers{question.answeredAt ? ` · ${relative(question.answeredAt)}` : ''}
              </p>
            </div>
          )}

          {isOrg && (
            <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              {!answered && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`answer-${question.id}`} className="text-xs text-muted-foreground">Answer live</Label>
                    <Input id={`answer-${question.id}`} className="mt-1 rounded-xl" value={answerDraft} placeholder="Type the answer shown to everyone…" onChange={(e) => setAnswerDraft(e.target.value.slice(0, 600))} />
                  </div>
                  <Button size="sm" className="rounded-full ievx-press" disabled={answerDraft.trim().length < 2} onClick={onAnswer}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Publish
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => onModerate(question.pinned ? 'unpin' : 'pin')}>
                  <Pin className="mr-1 h-3.5 w-3.5" /> {question.pinned ? 'Unpin' : 'Pin to top'}
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => onModerate(question.status === 'HIDDEN' ? 'unhide' : 'hide')}>
                  {question.status === 'HIDDEN' ? <Eye className="mr-1 h-3.5 w-3.5" /> : <EyeOff className="mr-1 h-3.5 w-3.5" />}
                  {question.status === 'HIDDEN' ? 'Restore' : 'Hide'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
