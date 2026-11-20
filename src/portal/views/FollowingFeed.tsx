'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, BellRing, CalendarDays, CheckCircle2, Globe2, HeartHandshake, Loader2, Megaphone, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiClientError, qs } from '../api'
import { navigate } from '../router'
import { dateLong, relative } from '../format'
import { EventCard, EventCardSkeleton, type EventCardData } from '../components/EventCard'
import { usePortal } from '../store'

type FeedRow = {
  id: string
  kind: 'EVENT' | 'UPDATE'
  activityAt: string
  title: string
  body: string | null
  important: boolean
  event: EventCardData
}
type FeedResponse = {
  items: FeedRow[]
  nextCursor: string | null
  hasMore: boolean
  followingCount: number
}

/**
 * Real, opt-in follower timeline. Every entry is attached to a public event
 * from an organizer the viewer follows. No invented posts, fake popularity,
 * advertisement insertion or private event exposure.
 */
export default function FollowingFeed() {
  const { user, booted } = usePortal()
  const [items, setItems] = useState<FeedRow[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)

  const load = useCallback(async (cursor: string | null) => {
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setLoading(true)
    setError('')
    if (!cursor) setItems(null)
    try {
      const data = await api.get<FeedResponse>('/social/feed' + qs({ cursor, pageSize: 12 }), { signal: active.signal })
      if (active.signal.aborted) return
      setItems((before) => {
        if (!cursor) return data.items
        const seen = new Set((before ?? []).map((row) => row.kind + ':' + row.id))
        return [...(before ?? []), ...data.items.filter((row) => !seen.has(row.kind + ':' + row.id))]
      })
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
      setFollowingCount(data.followingCount)
    } catch (err) {
      if (active.signal.aborted) return
      setError(err instanceof ApiClientError ? err.message : 'Could not refresh your Following feed. Check your connection.')
      if (!cursor) setItems([])
    } finally {
      if (!active.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (booted && user?.id) void load(null)
    return () => controller.current?.abort()
  }, [booted, user?.id, load])

  if (!booted) {
    return <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" aria-busy="true">
      {Array.from({ length: 3 }, (_, i) => <EventCardSkeleton key={i} />)}
    </div>
  }

  if (!user) {
    return <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UsersRound className="size-7" /></div>
      <h1 className="text-2xl font-bold">Your events. Your community.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Sign in to follow organizers and see their public events and announcements in one personal feed.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => navigate('/signin')}>Sign in</Button>
        <Button variant="outline" onClick={() => navigate('/')}>Explore events</Button>
      </div>
    </div>
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-9">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary"><Globe2 className="size-4" /> Events and communities worldwide</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold sm:text-3xl"><UsersRound className="size-7 text-primary" /> Following</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">New events and announcements from organizers you follow. Private gatherings and unrelated promotions never appear here.</p>
        </div>
        <Button variant="outline" size="sm" className="min-h-10 rounded-full" disabled={loading} onClick={() => void load(null)}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-4" aria-label="Your Following timeline" aria-busy={loading}>
          {items === null && !error && Array.from({ length: 2 }, (_, i) => <div key={i} className="rounded-2xl border bg-card p-4"><EventCardSkeleton /></div>)}
          {error && <div className="rounded-2xl border border-destructive/30 p-4" role="alert">
            <p className="text-sm">{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => void load(nextCursor)}>Retry</Button>
          </div>}
          {items && items.length === 0 && !error && <section className="rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
            <BellRing className="mx-auto mb-3 size-9 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">{followingCount ? 'No recent public updates yet' : 'Start following organizers'}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {followingCount
                ? 'The organizers you follow have no public events or announcements in the feed yet. Their next update will appear here.'
                : 'Discover an event you love, open its organizer profile and tap Follow. Their public activity will appear here.'}
            </p>
            <Button className="mt-5" onClick={() => navigate('/')}>Discover organizers <ArrowRight className="ml-2 size-4" /></Button>
          </section>}
          {items?.map((item) => <article key={item.kind + ':' + item.id} className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {item.kind === 'UPDATE' ? <Megaphone className="size-5" /> : <CalendarDays className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <button className="max-w-full truncate text-left text-sm font-semibold hover:text-primary hover:underline" onClick={() => navigate('/org/' + item.event.org?.slug)}>
                  {item.event.org?.name || 'Event organizer'}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {item.event.org?.verifiedAt && <span className="inline-flex items-center gap-0.5 text-primary"><ShieldCheck className="size-3" /> Verified</span>}
                  <span>{item.kind === 'UPDATE' ? 'Announcement' : 'Event added'}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={item.activityAt}>{relative(item.activityAt)}</time>
                </div>
              </div>
              {item.important && <Badge variant="outline" className="shrink-0 text-[10px]">Important</Badge>}
            </div>
            {item.kind === 'EVENT' ? <div className="mt-4 max-w-lg"><EventCard event={item.event} /></div> : <div className="mt-4">
              <h2 className="break-words text-base font-bold">{item.title}</h2>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/85">{item.body}</p>
              <button className="mt-4 flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary" onClick={() => navigate('/event/' + item.event.slug)}>
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.event.title}</span><span className="block text-xs text-muted-foreground">{dateLong(item.event.startsAt)}</span></span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </button>
            </div>}
          </article>)}
          {hasMore && items && items.length > 0 && <div className="py-3 text-center">
            <Button variant="outline" className="min-h-10 rounded-full" disabled={loading} onClick={() => void load(nextCursor)}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
              {loading ? 'Loading…' : 'Load more activity'}
            </Button>
          </div>}
          {items && items.length > 0 && !hasMore && <p className="py-4 text-center text-xs text-muted-foreground">You’re caught up with the public activity from your followed organizers.</p>}
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Following options">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2"><HeartHandshake className="size-5 text-primary" /><h2 className="font-bold">Your community</h2></div>
            <p className="mt-2 text-3xl font-extrabold">{followingCount}</p>
            <p className="text-xs text-muted-foreground">followed organizers available in this feed</p>
            <Button variant="outline" className="mt-4 w-full rounded-full" onClick={() => navigate('/me?tab=following')}>Manage following</Button>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /><h2 className="font-bold">Choose your feed</h2></div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Following is a chronological view of real organizer activity. Visit Discover for other public events or recommendations.</p>
            <Button variant="ghost" className="mt-3 w-full justify-between" onClick={() => navigate('/')}>Explore worldwide <ArrowRight className="size-4" /></Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
