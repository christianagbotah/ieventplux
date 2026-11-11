'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, MapPin, Monitor, Share2, Heart, Bookmark, Flag, Users, ChevronLeft, Info, ExternalLink, Accessibility, Ticket, ShieldCheck, Church } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError, qs } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { money, dateLong, timeRange, relative, initials, humanize } from '../format'
import { EmptyState } from '../components/EventCard'

interface TicketType {
  id: string
  name: string
  description?: string | null
  kind: string
  priceMinor: number
  currency: string
  quota: number
  soldCount: number
  reservedCount: number
  perBuyerLimit: number
  saleStartsAt?: string | null
  saleEndsAt?: string | null
  includesVirtualAccess: boolean
  groupMinQty?: number | null
  groupPctOff?: number | null
}

interface EventDetailPayload {
  event: {
    id: string
    title: string
    summary?: string | null
    description: string
    categorySlug: string
    tags: string[]
    coverImageUrl?: string | null
    gallery: { id: string; url: string; caption?: string | null }[]
    mode: string
    visibility: string
    status: string
    startsAt: string
    endsAt: string
    timezone: string
    city?: string | null
    country: string
    contactEmail?: string | null
    contactPhone?: string | null
    accessibilityInfo?: string | null
    attendanceRules?: string | null
    ageGuidance?: string | null
    refundPolicy?: string | null
    directionsUrl?: string | null
    agenda: { id: string; title: string; startsAt: string; endsAt?: string | null; speaker?: string | null; description?: string | null }[]
    ticketTypes: TicketType[]
    updates: { id: string; title: string; body: string; createdAt: string }[]
    broadcasts: { id: string; title: string; status: string; accessPolicy: string; recordingStatus: string }[]
    venue?: { name: string; address?: string | null; city?: string | null; mapsUrl?: string | null; accessibilityInfo?: string | null } | null
    org: { id: string; name: string; slug: string; tagline?: string | null; verifiedAt?: string | null; orgType: string }
    seriesId?: string | null
  }
  stats: { followers: number; going: number; comments: number }
  mine: { saved: boolean; going: boolean; following: boolean }
  canManage: boolean
}

interface CommentNode {
  id: string
  body: string
  createdAt: string
  user: { id: string; displayName: string; avatarUrl?: string | null }
  children?: CommentNode[]
}

export default function EventDetail({ slug }: { slug: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const [data, setData] = useState<EventDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentNode[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [mine, setMine] = useState({ saved: false, going: false, following: false })
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [discountCode, setDiscountCode] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [placing, setPlacing] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('SPAM')
  const [reportDetails, setReportDetails] = useState('')

  const load = useCallback(async () => {
    try {
      const payload = await api.get<EventDetailPayload>(`/events/${slug}`)
      setData(payload)
      setMine(payload.mine)
      const commentsPayload = await api.get<{ items: CommentNode[] }>(`/events/${payload.event.id}/comments?pageSize=20`).catch(() => ({ items: [] }))
      setComments(commentsPayload.items)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'This event could not be loaded.')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  const event = data?.event
  const saleable = useMemo(() => {
    if (!event) return []
    const now = Date.now()
    return event.ticketTypes.filter((tt) => {
      if (tt.saleStartsAt && new Date(tt.saleStartsAt).getTime() > now) return false
      if (tt.saleEndsAt && new Date(tt.saleEndsAt).getTime() < now) return false
      return tt.quota === 0 || tt.soldCount + tt.reservedCount < tt.quota
    })
  }, [event])

  const selectedTotal = useMemo(() => {
    if (!event) return 0
    let subtotal = 0
    for (const tt of saleable) {
      const qty = buyQty[tt.id] ?? 0
      if (qty <= 0) continue
      let line = tt.priceMinor * qty
      if (tt.groupMinQty && tt.groupPctOff && qty >= tt.groupMinQty) line -= Math.round((line * tt.groupPctOff) / 100)
      subtotal += line
    }
    return subtotal
  }, [buyQty, saleable, event])

  const toggleInterest = async (kind: 'SAVE' | 'GOING') => {
    if (!user) return navigate('/signin')
    if (!event) return
    try {
      const current = kind === 'SAVE' ? mine.saved : mine.going
      await api.post('/social/interest', { eventId: event.id, kind, remove: current })
      setMine((m) => ({ ...m, [kind === 'SAVE' ? 'saved' : 'going']: !current }))
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not update.', variant: 'destructive' })
    }
  }

  const toggleFollow = async () => {
    if (!user) return navigate('/signin')
    if (!event) return
    try {
      await api.post('/social/follow', { orgId: event.org.id })
      setMine((m) => ({ ...m, following: !m.following }))
      toast({ title: mine.following ? 'Unfollowed' : `Following ${event.org.name}`, description: mine.following ? undefined : 'You will see their events in your feed.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not follow.', variant: 'destructive' })
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/#/event/${slug}`
    try {
      if (navigator.share) await navigator.share({ title: event?.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast({ description: 'Event link copied to clipboard.' })
      }
    } catch {
      /* user cancelled share */
    }
  }

  const postComment = async () => {
    if (!user) return navigate('/signin')
    if (!event || commentDraft.trim().length < 2) return
    try {
      await api.post(`/events/${event.id}/comments`, { body: commentDraft })
      setCommentDraft('')
      const payload = await api.get<{ items: CommentNode[] }>(`/events/${event.id}/comments?pageSize=20`)
      setComments(payload.items)
      toast({ description: 'Comment posted.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not post the comment.', variant: 'destructive' })
    }
  }

  const placeOrder = async () => {
    if (!user) return navigate('/signin')
    if (!event) return
    const items = Object.entries(buyQty).filter(([, qty]) => qty > 0).map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }))
    if (items.length === 0) return
    setPlacing(true)
    try {
      const order = await api.post<{ orderReference: string; totalMinor: number; kind: 'PAID' | 'FREE'; expiresAt: string }>('/orders', {
        eventId: event.id,
        items,
        discountCode: discountCode.trim() || null,
        buyerPhone: buyerPhone.trim() || undefined,
      })
      if (order.kind === 'FREE') {
        await api.post(`/orders/${order.orderReference}`)
        toast({ title: 'RSVP confirmed 🎉', description: 'Your free tickets are in My Tickets.' })
        navigate(`/order/${order.orderReference}`)
      } else {
        const payment = await api.post<{ checkoutUrl: string; provider: string }>('/payments/initiate', { orderReference: order.orderReference })
        toast({ title: 'Order placed', description: payment.provider === 'SIMULATOR' ? 'Opening the dev payment simulator…' : 'Redirecting to Hubtel checkout…' })
        window.location.href = payment.checkoutUrl
      }
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not place the order.'
      toast({ title: 'Checkout failed', description: message, variant: 'destructive' })
    } finally {
      setPlacing(false)
    }
  }

  const submitReport = async () => {
    if (!user) return navigate('/signin')
    if (!event) return
    try {
      await api.post('/social/report', { targetType: 'EVENT', targetId: event.id, reason: reportReason, details: reportDetails })
      setReportOpen(false)
      setReportDetails('')
      toast({ title: 'Report submitted', description: 'Our moderation team will review it.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not submit the report.', variant: 'destructive' })
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState title="Event unavailable" description={error} action={<Button className="rounded-full" onClick={() => navigate('/')}>Back to Discover</Button>} />
      </div>
    )
  }

  if (!data || !event) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="ievx-skeleton h-72 w-full rounded-2xl" />
        <div className="mt-6 space-y-3">
          <div className="ievx-skeleton h-7 w-2/3 rounded" />
          <div className="ievx-skeleton h-4 w-1/3 rounded" />
          <div className="ievx-skeleton h-24 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const statusBadge = event.status === 'LIVE' ? { label: 'Live now', className: 'bg-destructive text-white' } : event.status === 'CANCELLED' ? { label: 'Cancelled', className: 'bg-destructive/15 text-destructive' } : event.status === 'POSTPONED' ? { label: 'Postponed', className: 'bg-accent text-accent-foreground' } : null

  return (
    <div className="pb-10">
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-full text-muted-foreground" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" /> All events
        </Button>
      </div>

      <div className="relative">
        <div className="relative h-64 w-full overflow-hidden sm:h-80 md:h-[420px]">
          {event.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.coverImageUrl} alt={`${event.title} artwork`} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          {statusBadge && <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide shadow ${statusBadge.className}`}>{statusBadge.label}</span>}
          {event.visibility !== 'PUBLIC' && (
            <span className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{event.visibility === 'UNLISTED' ? 'Unlisted (link only)' : 'Invitation only'}</span>
          )}
        </div>

        <div className="mx-auto -mt-16 max-w-5xl px-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">{humanize(event.categorySlug)}</Badge>
                <Badge variant="outline" className="gap-1 capitalize">{event.mode === 'VIRTUAL' ? <Monitor className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{humanize(event.mode)}</Badge>
              </div>
              <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">{event.title}</h1>
              {event.summary && <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{event.summary}</p>}
              <button className="mt-3 flex items-center gap-2 text-sm font-medium text-primary hover:underline" onClick={() => navigate(`/org/${event.org.slug}`)}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Church className="h-4 w-4 text-primary" aria-hidden /></span>
                {event.org.name}
                {event.org.verifiedAt && <ShieldCheck className="h-4 w-4 text-primary" aria-label="Verified organizer" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="rounded-full" aria-label={mine.saved ? 'Remove from saved' : 'Save event'} onClick={() => void toggleInterest('SAVE')}>
                <Bookmark className={`h-4 w-4 ${mine.saved ? 'fill-primary text-primary' : ''}`} />
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" aria-label={mine.going ? 'Cancel interest' : 'Mark as going'} onClick={() => void toggleInterest('GOING')}>
                <Heart className={`h-4 w-4 ${mine.going ? 'fill-destructive text-destructive' : ''}`} />
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" aria-label="Share event" onClick={() => void share()}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground" aria-label="Report event" onClick={() => setReportOpen(true)}>
                <Flag className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Left column */}
            <div className="space-y-6">
              <Card className="rounded-2xl">
                <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p>
                      <p className="font-semibold">{dateLong(event.startsAt, event.timezone)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Time ({event.timezone.replace('_', ' ')})</p>
                      <p className="font-semibold">{timeRange(event.startsAt, event.endsAt, event.timezone)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Venue</p>
                      <p className="font-semibold">{event.venue?.name ?? 'Online broadcast'}</p>
                      {event.venue?.address && <p className="text-sm text-muted-foreground">{event.venue.address}{event.venue.city ? `, ${event.venue.city}` : ''}</p>}
                      {event.directionsUrl && (
                        <a className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={event.directionsUrl} target="_blank" rel="noopener noreferrer">
                          Get directions <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Interest</p>
                      <p className="font-semibold">{data.stats.going} going · {data.stats.followers} followers</p>
                      {event.ageGuidance && <p className="text-sm text-muted-foreground">{event.ageGuidance}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2"><CardTitle className="text-base">About this event</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{event.description}</div>
                  {event.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {event.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-[11px]">#{tag}</Badge>)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {event.gallery.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Gallery</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {event.gallery.map((g) => (
                        <figure key={g.id} className="overflow-hidden rounded-xl">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.url} alt={g.caption ?? 'Event photo'} className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
                          {g.caption && <figcaption className="truncate p-2 text-xs text-muted-foreground">{g.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {event.agenda.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Agenda</CardTitle></CardHeader>
                  <CardContent>
                    <ol className="relative space-y-4 border-l border-border pl-5">
                      {event.agenda.map((item) => (
                        <li key={item.id} className="relative">
                          <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{timeRange(item.startsAt, item.endsAt ?? item.startsAt)}{item.speaker ? ` · ${item.speaker}` : ''}</p>
                          {item.description && <p className="mt-1 text-sm text-foreground/80">{item.description}</p>}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {(event.accessibilityInfo || event.attendanceRules || event.refundPolicy) && (
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Accessibility className="h-4 w-4 text-primary" /> Good to know</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm text-foreground/85">
                    {event.accessibilityInfo && <p><span className="font-semibold">Accessibility: </span>{event.accessibilityInfo}</p>}
                    {event.attendanceRules && <p><span className="font-semibold">Attendance rules: </span>{event.attendanceRules}</p>}
                    {event.refundPolicy && <p><span className="font-semibold">Refund policy: </span>{event.refundPolicy}</p>}
                  </CardContent>
                </Card>
              )}

              {event.updates.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Organizer updates</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {event.updates.map((u) => (
                      <article key={u.id} className="rounded-xl bg-secondary/50 p-4">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-semibold">{u.title}</p>
                          <span className="text-xs text-muted-foreground">{relative(u.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground/85">{u.body}</p>
                      </article>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Discussion */}
              <Card className="rounded-2xl" id="discussion">
                <CardHeader className="pb-2"><CardTitle className="text-base">Discussion ({data.stats.comments})</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {user ? (
                    <div className="flex gap-3">
                      <Avatar><AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{initials(user.displayName)}</AvatarFallback></Avatar>
                      <div className="flex-1 space-y-2">
                        <Textarea
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          placeholder="Ask a question or share excitement…"
                          aria-label="Write a comment"
                          className="min-h-20"
                        />
                        <Button size="sm" className="rounded-full ievx-press" disabled={commentDraft.trim().length < 2} onClick={() => void postComment()}>Post</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground">
                      <Button variant="link" className="h-auto p-0 text-primary" onClick={() => navigate('/signin')}>Sign in</Button> to join the discussion.
                    </p>
                  )}
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet — be the first!</p>
                  ) : (
                    <div className="space-y-4">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <Avatar><AvatarFallback className="bg-secondary text-xs font-bold">{initials(c.user.displayName)}</AvatarFallback></Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm"><span className="font-semibold">{c.user.displayName}</span> <span className="text-xs text-muted-foreground">· {relative(c.createdAt)}</span></p>
                            <p className="text-sm text-foreground/85">{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column: tickets */}
            <div className="space-y-4 lg:sticky lg:top-32 lg:self-start">
              {event.broadcasts.length > 0 && (
                <Card className="rounded-2xl border-destructive/25">
                  <CardContent className="p-4">
                    {event.broadcasts.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {b.status === 'LIVE' ? <span className="ievx-live-dot" /> : b.recordingStatus === 'AVAILABLE' ? <Monitor className="h-4 w-4 text-muted-foreground" /> : null}
                          <p className="truncate text-sm font-medium">{b.title}</p>
                        </div>
                        {b.status === 'LIVE' ? (
                          <Button size="sm" className="rounded-full ievx-press" onClick={() => navigate(`/broadcast/${b.id}`)}>Watch</Button>
                        ) : b.recordingStatus === 'AVAILABLE' ? (
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(`/broadcast/${b.id}`)}>Replay</Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Ended</Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Ticket className="h-4 w-4 text-primary" /> Tickets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {['CANCELLED'].includes(event.status) ? (
                    <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">This event was cancelled. Ticket holders are being notified and refunds follow the stated policy.</p>
                  ) : saleable.length === 0 ? (
                    <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                      {event.ticketTypes.length === 0 ? 'Tickets have not been published yet.' : 'All tickets are sold out.'}
                    </p>
                  ) : (
                    <>
                      {saleable.map((tt) => {
                        const remaining = tt.quota > 0 ? tt.quota - tt.soldCount - tt.reservedCount : null
                        return (
                          <div key={tt.id} className="rounded-xl border border-border/70 p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">{tt.name}</p>
                                <p className="text-xs text-muted-foreground">{tt.description}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <Badge variant="outline" className="text-[10px] capitalize">{humanize(tt.kind)}</Badge>
                                  {tt.includesVirtualAccess && <Badge variant="secondary" className="text-[10px]">+ online access</Badge>}
                                  {tt.groupMinQty && tt.groupPctOff && <Badge variant="secondary" className="text-[10px]">{tt.groupPctOff}% off groups of {tt.groupMinQty}+</Badge>}
                                  {remaining !== null && remaining <= 20 && <Badge variant="destructive" className="text-[10px]">{remaining === 0 ? 'Sold out' : `${remaining} left`}</Badge>}
                                </div>
                              </div>
                              <p className="whitespace-nowrap text-lg font-extrabold text-primary">{tt.priceMinor === 0 ? 'Free' : money(tt.priceMinor)}</p>
                            </div>
                          </div>
                        )
                      })}
                      <Button className="w-full rounded-xl py-6 text-base ievx-press" onClick={() => { setBuyQty({}); setBuyOpen(true) }}>
                        {saleable.some((t) => t.priceMinor > 0) ? 'Get tickets' : 'Free RSVP'}
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground">Secure checkout · Mobile money / cards via Hubtel</p>
                    </>
                  )}
                  {!mine.following && event.status !== 'CANCELLED' && (
                    <Button variant="outline" className="w-full rounded-xl" onClick={() => void toggleFollow()}>Follow {event.org.name}</Button>
                  )}
                </CardContent>
              </Card>

              {(event.contactEmail || event.contactPhone) && (
                <Card className="rounded-2xl">
                  <CardContent className="space-y-1.5 p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> Event contact</p>
                    {event.contactEmail && <p className="text-muted-foreground">{event.contactEmail}</p>}
                    {event.contactPhone && <p className="text-muted-foreground">{event.contactPhone}</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Buy dialog */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select tickets</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto ievx-scrollbar pr-1">
            {saleable.map((tt) => {
              const qty = buyQty[tt.id] ?? 0
              const max = Math.min(tt.perBuyerLimit, tt.quota > 0 ? tt.quota - tt.soldCount - tt.reservedCount : tt.perBuyerLimit)
              return (
                <div key={tt.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{tt.name}</p>
                    <p className="text-xs text-muted-foreground">{tt.priceMinor === 0 ? 'Free' : money(tt.priceMinor)} each{tt.perBuyerLimit ? ` · max ${tt.perBuyerLimit}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label={`Remove one ${tt.name}`} disabled={qty === 0} onClick={() => setBuyQty((q) => ({ ...q, [tt.id]: Math.max(0, qty - 1) }))}>−</Button>
                    <span className="w-6 text-center font-bold" aria-live="polite">{qty}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label={`Add one ${tt.name}`} disabled={qty >= max} onClick={() => setBuyQty((q) => ({ ...q, [tt.id]: qty + 1 }))}>+</Button>
                  </div>
                </div>
              )
            })}
            {saleable.some((t) => t.priceMinor > 0) && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="discount">Discount code (optional)</Label>
                  <Input id="discount" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="e.g. GOSPEL10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone for ticket SMS (optional)</Label>
                  <Input id="phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+233 24 000 0000" inputMode="tel" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex w-full items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-extrabold text-primary">{selectedTotal === 0 ? 'Free' : money(selectedTotal)}</span>
            </div>
            <Button className="w-full rounded-xl py-5 ievx-press" disabled={selectedTotal === 0 && Object.values(buyQty).every((q) => q === 0) || placing || Object.values(buyQty).every((q) => q === 0)} onClick={() => void placeOrder()}>
              {placing ? 'Reserving…' : selectedTotal === 0 ? 'Confirm free RSVP' : `Checkout · ${money(selectedTotal)}`}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">Tickets are held for 15 minutes after you continue.</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Report this event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <select id="reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">
                {['SPAM', 'OFFENSIVE', 'FRAUD', 'COPYRIGHT', 'OTHER'].map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="details">Details (optional)</Label>
              <Textarea id="details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Tell us what happened…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={() => void submitReport()}>Submit report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
