'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, Clock, MapPin, Mic2, ShoppingBag, FileText, Monitor, Share2, Heart, Bookmark, Flag, Users, ChevronLeft, Info, ExternalLink, Accessibility, Ticket, ShieldCheck, Church, Hourglass, Repeat, Star, Bell, BellRing, ScanSearch, TriangleAlert, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError, qs } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { money, dateLong, timeRange, relative, initials, humanize } from '../format'
import { EmptyState } from '../components/EventCard'
import { quoteTicketSelection, ticketCheckoutSupported, ticketAvailability } from '../lib/ticket-selection'
import { OrganizerEventCover } from '../components/OrganizerEventCover'
import LiveEngagement from '../components/LiveEngagement'
import ReviewsPanel from '../components/ReviewsPanel'
import UpdatesPanel from '../components/UpdatesPanel'

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
    slug: string
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
    contributors?: { id: string; name: string; role: string; topic?: string | null; bio?: string | null; photoUrl?: string | null; startsAt?: string | null }[]
    programmes?: { id: string; title: string; downloadUrl: string }[]
    souvenirs?: { id: string; name: string; variantLabel?: string | null; sku: string; priceMinor: number; imageUrl?: string | null; description?: string | null; available: number; onlineOrderingEnabled: boolean }[]
    ticketTypes: TicketType[]
    updates: { id: string; title: string; body: string; important: boolean; createdAt: string }[]
    broadcasts: { id: string; title: string; status: string; accessPolicy: string; recordingStatus: string }[]
    venue?: { name: string; address?: string | null; city?: string | null; mapsUrl?: string | null; accessibilityInfo?: string | null } | null
    org: { id: string; name: string; slug: string; tagline?: string | null; verifiedAt?: string | null; orgType: string }
    seriesId?: string | null
  }
  stats: { followers: number; going: number; comments: number; ratingAvg: number; ratingCount: number }
  mine: { saved: boolean; going: boolean; following: boolean; rsvpStatus: string | null; rsvpGuests: number | null }
  canManage: boolean
}

interface SeriesInfo {
  series: { id: string; title: string; recurrence: string } | null
  occurrences: { id: string; slug: string; title: string; startsAt: string; status: string }[]
}

interface WaitlistStatus {
  count: number
  mine: { position: number; status: string; partySize: number; notifiedAt: string | null } | null
  entries?: { id: string; name: string; contact: string; partySize: number; status: string; ticketType: string | null; joinedAt: string; notifiedAt: string | null }[] | null
}

interface ReminderState {
  active: boolean
  holdingTicket: boolean
  upcoming: boolean
}

interface TriageResult {
  source: 'AI' | 'UNAVAILABLE'
  scanned: number
  flagged: number
  items: { id: string; kind: string; verdict: string; reason: string; excerpt: string }[]
  note?: string
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
  const [mine, setMine] = useState({ saved: false, going: false, following: false, rsvpStatus: null as string | null, rsvpGuests: null as number | null })
  const [inviteCode, setInviteCode] = useState('')
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [discountCode, setDiscountCode] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [placing, setPlacing] = useState(false)
  const [followingBusy, setFollowingBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('SPAM')
  const [reportDetails, setReportDetails] = useState('')
  const [waitlist, setWaitlist] = useState<WaitlistStatus | null>(null)
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null)
  const [wlOpen, setWlOpen] = useState(false)
  const [wlType, setWlType] = useState('')
  const [wlForm, setWlForm] = useState({ name: '', contact: '', partySize: 1 })
  const [wlBusy, setWlBusy] = useState(false)
  const [reminder, setReminder] = useState<ReminderState | null>(null)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [triage, setTriage] = useState<TriageResult | null>(null)
  const [triageBusy, setTriageBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const payload = await api.get<EventDetailPayload>(`/events/${slug}`)
      setData(payload)
      setMine(payload.mine)
      const commentsPayload = await api.get<{ items: CommentNode[] }>(`/events/${payload.event.id}/comments?pageSize=20`).catch(() => ({ items: [] }))
      setComments(commentsPayload.items)
      const wl = await api.get<WaitlistStatus>(`/events/${payload.event.id}/waitlist`).catch(() => null)
      setWaitlist(wl)
      const rem = await api.get<ReminderState>(`/events/${payload.event.id}/reminder`).catch(() => null)
      setReminder(rem)
      if (payload.event.seriesId) {
        const si = await api.get<SeriesInfo>(`/events/${payload.event.id}/series`).catch(() => null)
        setSeriesInfo(si)
      } else {
        setSeriesInfo(null)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'This event could not be loaded.')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  const event = data?.event
  const [salesClock, setSalesClock] = useState(() => Date.now())
  // A sale that opens while the visitor has this page open should become buyable
  // without a hard refresh; the server still validates every reservation.
  useEffect(() => {
    const handle = window.setInterval(() => setSalesClock(Date.now()), 30_000)
    return () => window.clearInterval(handle)
  }, [])
  const saleable = useMemo(() => {
    if (!event) return []
    const now = salesClock
    return event.ticketTypes.filter((tt) => {
      if (tt.saleStartsAt && new Date(tt.saleStartsAt).getTime() > now) return false
      if (tt.saleEndsAt && new Date(tt.saleEndsAt).getTime() < now) return false
      return tt.quota === 0 || tt.soldCount + tt.reservedCount < tt.quota
    })
  }, [event, salesClock])

  const upcomingTicketTypes = useMemo(() => event?.ticketTypes.filter((tt) => tt.saleStartsAt && new Date(tt.saleStartsAt).getTime() > salesClock && (tt.quota === 0 || tt.soldCount + tt.reservedCount < tt.quota)) ?? [], [event, salesClock])

  const soldOutTypes = useMemo(() => {
    if (!event) return []
    const now = salesClock
    return event.ticketTypes.filter((tt) =>
      (!tt.saleStartsAt || new Date(tt.saleStartsAt).getTime() <= now) &&
      (!tt.saleEndsAt || new Date(tt.saleEndsAt).getTime() >= now) &&
      tt.quota > 0 && tt.soldCount + tt.reservedCount >= tt.quota)
  }, [event, salesClock])

  const nextOccurrence = useMemo(() => {
    if (!seriesInfo || !event) return null
    const future = seriesInfo.occurrences
      .filter((o) => new Date(o.startsAt).getTime() > Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    return future[0] ?? null
  }, [seriesInfo, event])

  const supportedSaleable = useMemo(() =>
    saleable.filter((tt) => ticketCheckoutSupported(tt) && ticketAvailability(tt) > 0), [saleable])

  // For now the payment backend settles paid tickets in GHS; selecting free
  // international tickets is still allowed. Never silently sum EUR/USD as cedis.
  const selectionQuote = useMemo(() => quoteTicketSelection(supportedSaleable, buyQty), [supportedSaleable, buyQty])
  const selectedTotal = selectionQuote.subtotalMinor

  const openBooking = () => {
    setBuyQty({})
    setDiscountCode('')
    setBuyOpen(true)
  }

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
    if (!event || followingBusy) return
    const wasFollowing = mine.following
    setFollowingBusy(true)
    try {
      await api.post(wasFollowing ? '/social/unfollow' : '/social/follow', { orgId: event.org.id })
      setMine((m) => ({ ...m, following: !wasFollowing }))
      setData((current) => current
        ? { ...current, stats: { ...current.stats, followers: Math.max(0, current.stats.followers + (wasFollowing ? -1 : 1)) } }
        : current)
      toast({
        title: wasFollowing ? 'Organizer unfollowed' : 'Following ' + event.org.name,
        description: wasFollowing ? 'Their updates will no longer appear in your Following feed.' : 'Their public events and announcements can appear in your Following feed.',
      })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not update following.', variant: 'destructive' })
    } finally {
      setFollowingBusy(false)
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

  const openWaitlist = (typeId?: string) => {
    setWlType(typeId ?? '')
    setWlForm({ name: user?.displayName ?? '', contact: user?.email ?? '', partySize: 1 })
    setWlOpen(true)
  }

  const joinWaitlist = async () => {
    if (!event) return
    setWlBusy(true)
    try {
      const res = await api.post<{ position: number; reactivated: boolean }>(`/events/${event.id}/waitlist`, {
        name: wlForm.name,
        contact: wlForm.contact,
        partySize: wlForm.partySize,
        ticketTypeId: wlType || undefined,
      })
      setWlOpen(false)
      toast({ title: res.reactivated ? 'Back on the waitlist' : 'You are on the waitlist', description: `You are #${res.position} in line. We will alert you the moment tickets open up.` })
      void load()
    } catch (err) {
      toast({ title: 'Could not join the waitlist', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setWlBusy(false)
    }
  }

  const leaveWaitlist = async () => {
    if (!event) return
    try {
      await api.post(`/events/${event.id}/waitlist-leave`, { contact: user?.email ?? wlForm.contact })
      toast({ title: 'You left the waitlist', description: 'You can re-join any time while tickets remain sold out.' })
      void load()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not leave the waitlist.', variant: 'destructive' })
    }
  }

  // Round 15: "Remind me" opt-in — signed-in fans without a ticket get an
  // in-app alert ~24 h before the event. Guests are sent to sign-in first.
  const toggleReminder = async () => {
    if (!event) return
    if (!user) return navigate('/signin')
    if (reminderBusy) return
    setReminderBusy(true)
    try {
      if (reminder?.active) {
        await api.post(`/events/${event.id}/reminder-cancel`, {})
        setReminder({ ...(reminder ?? { active: false, holdingTicket: false, upcoming: true }), active: false })
        toast({ title: 'Reminder removed', description: 'You will not be notified about this event.' })
      } else {
        await api.post(`/events/${event.id}/reminder`, {})
        setReminder({ ...(reminder ?? { active: false, holdingTicket: false, upcoming: true }), active: true })
        toast({ title: 'We will remind you', description: 'Expect an alert about 24 hours before the event starts.' })
      }
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not update the reminder.', variant: 'destructive' })
    } finally {
      setReminderBusy(false)
    }
  }

  // Round 15: AI moderation triage — advisory flags only; the organizer
  // decides using the hide/delete controls in the panels below.
  const runTriage = async () => {
    if (!event || triageBusy) return
    setTriageBusy(true)
    try {
      const result = await api.post<TriageResult>(`/events/${event.id}/moderation-triage`, {})
      setTriage(result)
      if (result.source === 'AI') {
        toast({ title: result.flagged > 0 ? `${result.flagged} item${result.flagged === 1 ? '' : 's'} flagged for review` : 'Nothing suspicious found', description: `${result.scanned} items scanned · flags are advisory — nothing was hidden.` })
      } else {
        toast({ description: result.note ?? 'AI triage unavailable right now.', variant: 'destructive' })
      }
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not run the AI triage.', variant: 'destructive' })
    } finally {
      setTriageBusy(false)
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
    const quote = quoteTicketSelection(supportedSaleable, buyQty)
    if (quote.invalid || quote.unsupported || quote.count === 0) {
      toast({ title: 'Check your ticket selection', description: 'Select an available ticket quantity. Unavailable payment currencies cannot be checked out here.', variant: 'destructive' })
      return
    }
    const items = supportedSaleable.filter((tt) => (buyQty[tt.id] ?? 0) > 0).map((tt) => ({ ticketTypeId: tt.id, qty: buyQty[tt.id] }))
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

  const checkoutDisabled = selectionQuote.count === 0 || selectionQuote.invalid || selectionQuote.unsupported || placing
  const checkoutAvailable = supportedSaleable.length > 0
  const requiresInvitation = event.visibility === 'INVITE_ONLY' && !data.canManage && mine.rsvpStatus !== 'APPROVED'
  const canBook = ['PUBLISHED', 'LIVE'].includes(event.status) && checkoutAvailable && !requiresInvitation

  return (
    <div className="pb-36 md:pb-12">
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-full text-muted-foreground" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" /> All events
        </Button>
      </div>

      <div className="relative">
        <figure className="relative mx-4 overflow-hidden rounded-2xl sm:mx-6 lg:mx-8">
          <div className="relative h-52 w-full overflow-hidden sm:h-72 md:h-[380px]">
            {event.coverImageUrl ? (
              <img src={event.coverImageUrl} alt={`${event.title} artwork`} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />
            )}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-background via-background/20 to-transparent" />
            {statusBadge && <span className={`absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide shadow ${statusBadge.className}`}>{statusBadge.label}</span>}
            {event.visibility !== 'PUBLIC' && (
              <span className="absolute right-4 top-4 z-20 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{event.visibility === 'UNLISTED' ? 'Unlisted (link only)' : 'Invitation only'}</span>
            )}
          </div>
        </figure>

        {/* relative + z-10 keeps the title above the ken-burns image's compositing layer */}
        <div className="relative z-10 mx-auto -mt-16 max-w-5xl px-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">{humanize(event.categorySlug)}</Badge>
                <Badge variant="outline" className="gap-1 capitalize">{event.mode === 'VIRTUAL' ? <Monitor className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{humanize(event.mode)}</Badge>
              </div>
              <h1 className="max-w-3xl text-[1.7rem] font-extrabold leading-[1.12] tracking-tight sm:text-4xl">{event.title}</h1>
              {event.summary && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{event.summary}</p>
              )}
              <button className="mt-3 flex items-center gap-2 text-sm font-medium text-primary" onClick={() => navigate(`/org/${event.org.slug}`)}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Church className="h-4 w-4 text-primary" aria-hidden /></span>
                <span className="efx-underline-slide-link" style={{ fontSize: '0.95rem', color: 'inherit' }}>{event.org.name}</span>
                {event.org.verifiedAt && <ShieldCheck className="h-4 w-4 text-primary" aria-label="Verified organizer" />}
              </button>
              {nextOccurrence && (
                <button type="button" onClick={() => navigate(`/event/${nextOccurrence.slug}`)} className="efx-badge-ping mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  <Repeat className="h-3.5 w-3.5" aria-hidden />
                  Weekly series — next date {dateLong(nextOccurrence.startsAt, event.timezone)}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="rounded-full" aria-label={mine.saved ? 'Remove from saved' : 'Save event'} onClick={() => void toggleInterest('SAVE')}>
                <Bookmark className={`h-4 w-4 ${mine.saved ? 'fill-primary text-primary' : ''}`} />
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" aria-label={mine.going ? 'Cancel interest' : 'Mark as going'} onClick={() => void toggleInterest('GOING')}>
                <Heart className={`h-4 w-4 ${mine.going ? 'fill-destructive text-destructive' : ''}`} />
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" asChild>
                <a href={`/api/v1/events/${event.id}/ics`} download aria-label="Add to calendar (downloads an .ics file)">
                  <CalendarPlus className="h-4 w-4" />
                </a>
              </Button>
              {reminder?.upcoming && !reminder.holdingTicket && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  aria-label={reminder.active ? 'Remove reminder' : 'Remind me 24 hours before this event'}
                  aria-pressed={reminder.active}
                  disabled={reminderBusy}
                  onClick={() => void toggleReminder()}
                >
                  {reminder.active ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="outline" size="icon" className="rounded-full" aria-label="Share event" onClick={() => void share()}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground" aria-label="Report event" onClick={() => setReportOpen(true)}>
                <Flag className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-7">
            {/* Left column */}
            <div className="order-2 min-w-0 space-y-5 lg:order-1">
              {['LIVE', 'PUBLISHED'].includes(event.status) && (
                <LiveEngagement eventId={event.id} slug={event.slug} live={event.status === 'LIVE'} />
              )}
              <Card className="rounded-2xl">
                <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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
                      <p className="mt-1 text-xs text-muted-foreground">Times shown in the organizer's timezone</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Venue</p>
                      <p className="font-semibold">{event.venue?.name ?? 'Online broadcast'}</p>
                      {event.venue?.address && <p className="text-sm text-muted-foreground">{event.venue.address}{event.venue.city ? `, ${event.venue.city}` : ''}</p>}
                      {event.venue?.accessibilityInfo && <p className="text-sm text-muted-foreground"><span className="font-medium">Accessibility:</span> {event.venue.accessibilityInfo}</p>}
                      {(event.directionsUrl ?? event.venue?.mapsUrl) && (
                        <a className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary" href={(event.directionsUrl ?? event.venue?.mapsUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
                          <span className="efx-underline-slide-link" style={{ fontSize: '0.875rem', color: 'inherit' }}>Get directions</span> <ExternalLink className="h-3.5 w-3.5" />
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
                  {data.stats.ratingCount > 0 && (
                    <div className="flex items-start gap-3">
                      <Star className="mt-0.5 h-5 w-5 fill-accent text-accent" aria-hidden />
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Attendee rating</p>
                        <p className="flex items-center gap-1.5 font-semibold">
                          {data.stats.ratingAvg}
                          <span className="flex text-accent" aria-hidden>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(data.stats.ratingAvg) ? 'fill-accent text-accent' : 'text-muted-foreground/40'}`} />
                            ))}
                          </span>
                          <span className="text-sm font-normal text-muted-foreground">· {data.stats.ratingCount} review{data.stats.ratingCount === 1 ? '' : 's'}</span>
                        </p>
                      </div>
                    </div>
                  )}
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
                          { }
                          <img src={g.url} alt={g.caption ?? 'Event photo'} className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
                          {g.caption && <figcaption className="truncate p-2 text-xs text-muted-foreground">{g.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!!event.contributors?.length && (
                <Card className="rounded-2xl" id="lineup">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Mic2 className="size-4 text-primary" /> Artists, invited guests & speakers</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {event.contributors.map((person) => (
                      <article key={person.id} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-secondary/20 p-3">
                        <OrganizerEventCover src={person.photoUrl} title={person.name} />
                        <div className="min-w-0 self-center">
                          <h3 className="text-sm font-bold leading-snug [overflow-wrap:break-word]">{person.name}</h3>
                          <p className="mt-1 text-xs font-medium text-primary">{({ HEADLINER: 'Headline artist', ARTIST: 'Performer', MAIN_SPEAKER: 'Main speaker', ASSISTANT_SPEAKER: 'Assistant speaker', GUEST_SPEAKER: 'Invited speaker', SPECIAL_GUEST: 'Special guest', PANELIST: 'Panelist', MC: 'Master of ceremonies', DJ: 'DJ', HOST: 'Host' } as Record<string, string>)[person.role] ?? humanize(person.role)}</p>
                        </div>
                        {person.topic && <p className="col-span-2 text-sm font-semibold">Topic / appearance: {person.topic}</p>}
                        {person.startsAt && <p className="col-span-2 text-xs text-muted-foreground">Scheduled: {new Date(person.startsAt).toLocaleString()}</p>}
                        {person.bio && <p className="col-span-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{person.bio}</p>}
                      </article>
                    ))}
                  </CardContent>
                </Card>
              )}

              {!!event.programmes?.length && (
                <Card className="rounded-2xl" id="event-programmes">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4 text-primary" /> Event programme & outlines</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {event.programmes.map((document) => (
                      <a key={document.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 p-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary/50" href={document.downloadUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="size-5 shrink-0" /><span className="min-w-0 flex-1 break-words">{document.title}</span><span className="shrink-0 text-xs">View PDF</span>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {!!event.souvenirs?.length && (
                <Card className="rounded-2xl" id="event-souvenirs">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShoppingBag className="size-4 text-primary" /> Event souvenirs & merchandise</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">The organizer's current product catalogue is displayed below. Online merchandise ordering and collection QR codes are not yet active, so no payment is collected for these items through this page.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {event.souvenirs.map((product) => (
                        <article key={product.id} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 p-3">
                          <OrganizerEventCover src={product.imageUrl} title={product.name} />
                          <div className="min-w-0"><h3 className="text-sm font-bold [overflow-wrap:break-word]">{product.name}</h3>{product.variantLabel && <p className="text-xs text-muted-foreground">{product.variantLabel}</p>}<p className="mt-1 text-sm font-bold text-primary">{money(product.priceMinor)}</p></div>
                          {product.description && <p className="col-span-2 text-xs leading-relaxed text-muted-foreground">{product.description}</p>}
                          <p className="col-span-2 text-[11px] font-medium text-muted-foreground">{product.available > 0 ? `${product.available} listed in stock` : 'Currently out of stock'} · Product code: {product.sku}</p>
                        </article>
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

              {['PUBLISHED', 'SCHEDULED', 'LIVE', 'POSTPONED'].includes(event.status) && (
                <UpdatesPanel eventId={event.id} canManage={data.canManage} orgName={event.org.name} initial={event.updates} />
              )}

              {/* Discussion */}
              <Card className="rounded-2xl" id="discussion">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    Discussion ({data.stats.comments})
                    {data.canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto rounded-full"
                        disabled={triageBusy}
                        onClick={() => void runTriage()}
                        aria-label="Run AI moderation triage over comments, questions and reviews"
                      >
                        {triageBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="mr-1.5 h-3.5 w-3.5" />}
                        AI triage
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.canManage && triage && triage.source === 'AI' && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4" role="region" aria-label="AI moderation triage results">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                        AI triage — {triage.flagged} of {triage.scanned} item{triage.scanned === 1 ? '' : 's'} flagged
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Advisory only — nothing was hidden or removed. Moderate with the controls below and in Reviews.
                      </p>
                      {triage.items.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {triage.items.map((item) => (
                            <li key={item.id} className="rounded-xl border border-border/60 bg-card p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{humanize(item.kind)}</Badge>
                                <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400">{humanize(item.verdict)}</Badge>
                                <span className="text-xs text-muted-foreground">{item.reason}</span>
                              </div>
                              <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">“{item.excerpt}”</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
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

              <ReviewsPanel eventId={event.id} />
            </div>

            {/* Right column: tickets */}
            <aside id="tickets" className="order-1 min-w-0 space-y-4 scroll-mt-28 lg:order-2 lg:sticky lg:top-24 lg:self-start" aria-label="Tickets and attendance">
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

              <div className="ievx-booking-panel rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><Ticket className="size-5 text-primary" aria-hidden /> Tickets & entry</h2>
                    <Badge variant="secondary" className="text-[10px]">{event.mode === 'VIRTUAL' ? 'Online event' : event.mode === 'HYBRID' ? 'In person & online' : 'In person'}</Badge>
                  </div>
                  {['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status) ? (
                    <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                      {event.status === 'CANCELLED' ? 'This event has been cancelled. Check the organizer’s refund policy and your ticket status.' : event.status === 'POSTPONED' ? 'This event has been postponed. Ticket checkout is paused until new arrangements are confirmed.' : 'This event has ended. Tickets are no longer available.'}
                    </p>
                  ) : saleable.length === 0 ? (
                    <div className="space-y-3">
                      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                        {event.ticketTypes.length === 0 ? 'Tickets have not been published yet.' : upcomingTicketTypes.length > 0 ? 'Ticket sales are scheduled to open soon.' : soldOutTypes.length > 0 ? 'All currently available tickets are sold out.' : 'Ticket sales are currently closed.'}
                      </p>
                      {upcomingTicketTypes.length > 0 && <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-semibold">Upcoming ticket releases</p>{upcomingTicketTypes.map((type) => <p key={type.id} className="text-xs text-muted-foreground">{type.name} · opens {new Date(type.saleStartsAt!).toLocaleString()}</p>)}</div>}
                      {soldOutTypes.length > 0 && !['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status) && new Date(event.startsAt).getTime() > salesClock && (
                        <div className="rounded-xl border border-border bg-muted/30 p-4">
                          <p className="flex items-center gap-2 text-sm font-semibold">
                            <Hourglass className="h-4 w-4 text-amber-600" aria-hidden /> Waitlist
                            {waitlist && waitlist.count > 0 && (
                              <span className="relative ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                {waitlist.count}
                              </span>
                            )}
                          </p>
                          {waitlist?.mine ? (
                            <div className="mt-2 space-y-2">
                              <p className="text-xs text-muted-foreground">
                                {waitlist.mine.status === 'WAITING' && <>You are <span className="font-bold text-amber-700 dark:text-amber-300">#{waitlist.mine.position}</span> in line ({waitlist.mine.partySize} {waitlist.mine.partySize === 1 ? 'seat' : 'seats'}). We will alert you when tickets open up.</>}
                                {waitlist.mine.status === 'NOTIFIED' && <><span className="font-semibold text-primary">Tickets opened up — check your alerts!</span> First come, first served.</>}
                                {waitlist.mine.status === 'LEFT' && 'You left the waitlist. You can re-join below.'}
                              </p>
                              {waitlist.mine.status !== 'LEFT' && (
                                <button type="button" className="text-xs font-semibold text-primary underline underline-offset-4" onClick={() => void leaveWaitlist()}>
                                  Leave the waitlist
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 space-y-2.5">
                              <p className="text-xs text-muted-foreground">
                                {waitlist && waitlist.count > 0 ? `${waitlist.count} ${waitlist.count === 1 ? 'person is' : 'people are'} waiting.` : 'Be first in line when someone cancels or the organizer adds seats.'}
                              </p>
                              <button type="button" className="min-h-11 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50" onClick={() => openWaitlist()}>
                                Join the waitlist
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {upcomingTicketTypes.length > 0 && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><p className="mb-1 font-semibold text-foreground">More tickets opening soon</p>{upcomingTicketTypes.map((type) => <p key={type.id}>{type.name} · {new Date(type.saleStartsAt!).toLocaleString()}</p>)}</div>}
                      {saleable.map((tt) => {
                        const remaining = tt.quota > 0 ? tt.quota - tt.soldCount - tt.reservedCount : null
                        return (
                          <div key={tt.id} className="ievx-booking-ticket rounded-xl border border-border bg-muted/15 p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">{tt.name}</p>
                                <p className="text-xs text-muted-foreground">{tt.description}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <Badge variant="outline" className="text-[10px] capitalize">{humanize(tt.kind)}</Badge>
                                  {tt.includesVirtualAccess && <Badge variant="secondary" className="text-[10px]">+ online access</Badge>}
                                  {tt.groupMinQty && tt.groupPctOff && <Badge variant="secondary" className="text-[10px]">{tt.groupPctOff}% off groups of {tt.groupMinQty}+</Badge>}
                                  {remaining !== null && remaining <= 20 && <Badge variant="destructive" className="text-[10px]">{remaining === 0 ? 'Sold out' : `${remaining} left`}</Badge>}
                                  {!ticketCheckoutSupported(tt) && <Badge variant="outline" className="text-[10px]">Checkout unavailable in {tt.currency}</Badge>}
                                  {remaining === 0 && (
                                    <button type="button" className="text-[11px] font-semibold text-primary underline underline-offset-2" onClick={() => openWaitlist(tt.id)}>
                                      Join waitlist
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="shrink-0 whitespace-nowrap text-lg font-extrabold text-primary">{tt.priceMinor === 0 ? 'Free' : money(tt.priceMinor, tt.currency)}</p>
                            </div>
                          </div>
                        )
                      })}
                      {event.visibility === 'INVITE_ONLY' && !data.canManage && mine.rsvpStatus !== 'APPROVED' ? (
                        // R28: truthful invitation gate — the old UI let anyone
                        // open checkout and hit a bare 403. Now: code entry, or the
                        // real RSVP state (pending/declined), replaces the CTA.
                        <div className="space-y-2.5">
                          {mine.rsvpStatus === 'PENDING' ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Invitation awaiting approval</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">The organizer is reviewing your RSVP — you will be notified when they decide.</p>
                            </div>
                          ) : mine.rsvpStatus === 'DECLINED' ? (
                            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-center">
                              <p className="text-sm font-semibold text-destructive">RSVP declined</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">The organizer was unable to accommodate this RSVP.</p>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-1.5">
                                <label htmlFor="invite-code" className="text-xs font-semibold text-foreground">Invitation code</label>
                                <input
                                  id="invite-code"
                                  value={inviteCode}
                                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                  placeholder="e.g. DONOR2026"
                                  autoComplete="off"
                                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                              </div>
                              <button
                                type="button"
                                className="min-h-11 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                                onClick={() => {
                                  const trimmed = inviteCode.trim()
                                  if (!trimmed) {
                                    toast({ title: 'Enter your invitation code', variant: 'destructive' })
                                    return
                                  }
                                  navigate(`/invite/${encodeURIComponent(trimmed.toUpperCase())}`)
                                }}
                              >
                                Redeem invitation
                              </button>
                              <p className="text-center text-xs leading-relaxed text-muted-foreground">Approved invitations unlock the private address and tickets.</p>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {event.visibility === 'INVITE_ONLY' && mine.rsvpStatus === 'APPROVED' && (
                            <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-center text-xs font-semibold text-primary">
                              Invitation approved — private address unlocked{mine.rsvpGuests ? ` · ${mine.rsvpGuests} ${mine.rsvpGuests === 1 ? 'place' : 'places'}` : ''}
                            </p>
                          )}
                          {checkoutAvailable ? <button type="button" className="min-h-11 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50" disabled={!canBook} onClick={openBooking}>
                            {supportedSaleable.some((t) => t.priceMinor > 0) ? 'Choose tickets' : 'Register for free'}
                          </button> : <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-foreground">Online payment for these ticket currencies is not available yet. Contact the organizer for alternatives.</p>}
                          {checkoutAvailable && <p className="text-center text-xs leading-relaxed text-muted-foreground">{supportedSaleable.some((t) => t.priceMinor > 0) ? 'Final payment methods are shown at checkout.' : 'Free registration is confirmed when your tickets are issued.'}</p>}
                        </>
                      )}
                    </>
                  )}
                  {event.status !== 'CANCELLED' && (
                    <button type="button" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60" disabled={followingBusy} aria-pressed={mine.following} onClick={() => void toggleFollow()}>
                      {followingBusy ? 'Updating…' : mine.following ? 'Following · tap to unfollow' : 'Follow ' + event.org.name}
                    </button>
                  )}
                </div>
              </div>

              {data?.canManage && waitlist?.entries && waitlist.entries.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Hourglass className="h-4 w-4 text-primary" aria-hidden /> Waitlist ({waitlist.count} waiting)</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-64 space-y-2 overflow-y-auto ievx-scrollbar p-4 pt-0">
                    {waitlist.entries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{e.name} <span className="text-muted-foreground">· {e.partySize}</span></p>
                          <p className="truncate text-xs text-muted-foreground">{e.contact}{e.ticketType ? ` · ${e.ticketType}` : ''}</p>
                        </div>
                        <Badge variant={e.status === 'WAITING' ? 'secondary' : e.status === 'NOTIFIED' ? 'default' : 'outline'} className="shrink-0 text-[10px]">{humanize(e.status)}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(event.contactEmail || event.contactPhone) && (
                <Card className="rounded-2xl">
                  <CardContent className="space-y-1.5 p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> Event contact</p>
                    {event.contactEmail && <p className="text-muted-foreground">{event.contactEmail}</p>}
                    {event.contactPhone && <p className="text-muted-foreground">{event.contactPhone}</p>}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </div>
      </div>

      {canBook && !buyOpen && (
        <div className="ievx-mobile-booking-bar fixed inset-x-0 z-30 border-t border-border bg-card/95 px-4 py-2.5 shadow-[0_-8px_30px_rgba(5,30,33,0.10)] backdrop-blur-xl lg:hidden"
          role="region" aria-label="Quick event registration">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-muted-foreground">Tickets for {event.title}</p>
              <p className="text-sm font-extrabold text-foreground">
                {supportedSaleable.some((tt) => tt.priceMinor === 0)
                  ? 'Free entry available'
                  : 'From ' + money(Math.min(...supportedSaleable.map((tt) => tt.priceMinor)), 'GHS')}
              </p>
            </div>
            <Button className="h-11 shrink-0 rounded-xl px-5 font-bold" onClick={openBooking}>
              {supportedSaleable.some((tt) => tt.priceMinor > 0) ? 'Get tickets' : 'Register free'}
              <ChevronLeft className="ml-1.5 size-4 rotate-180" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* Buy dialog */}
      <Dialog open={buyOpen} onOpenChange={(open) => { if (!placing) setBuyOpen(open) }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4">
            <DialogTitle className="text-lg font-extrabold">Choose your tickets</DialogTitle>
            <p className="text-sm text-muted-foreground">Choose how many tickets you need. Seats and final pricing are verified when you reserve.</p>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 ievx-scrollbar sm:px-5">
            {supportedSaleable.map((tt) => {
              const qty = buyQty[tt.id] ?? 0
              const max = ticketAvailability(tt)
              return (
                <div key={tt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:flex-nowrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{tt.name}</p>
                    <p className="text-xs text-muted-foreground">{tt.priceMinor === 0 ? 'Free' : money(tt.priceMinor, tt.currency)} each{tt.perBuyerLimit ? ` · max ${tt.perBuyerLimit}` : ''}</p>
                    {tt.quota > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{Math.max(0, tt.quota - tt.soldCount - tt.reservedCount)} seats remaining</p>}
                    {tt.includesVirtualAccess && <Badge variant="secondary" className="mt-1 text-[10px]">Includes online access</Badge>}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" aria-label={`Remove one ${tt.name}`} disabled={qty === 0} onClick={() => setBuyQty((q) => ({ ...q, [tt.id]: Math.max(0, qty - 1) }))}>−</Button>
                    <span className="w-8 text-center font-bold tabular-nums" aria-live="polite">{qty}</span>
                    <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" aria-label={`Add one ${tt.name}`} disabled={qty >= max} onClick={() => setBuyQty((q) => ({ ...q, [tt.id]: qty + 1 }))}>+</Button>
                  </div>
                </div>
              )
            })}
            {supportedSaleable.some((t) => t.priceMinor > 0) && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="discount">Discount code (optional)</Label>
                  <div className="efx-glow-focus-input" style={{ maxWidth: '100%', margin: 0 }}>
                    <input id="discount" className="efx-glow-focus-input__field" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="e.g. GOSPEL10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone for ticket notifications (optional)</Label>
                  <div className="efx-glow-focus-input" style={{ maxWidth: '100%', margin: 0 }}>
                    <input id="phone" className="efx-glow-focus-input__field" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+233 24 000 0000" inputMode="tel" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 flex-col gap-3 border-t border-border/70 bg-card px-4 py-4 sm:flex-col sm:px-5">
            <div className="flex w-full items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Estimated ticket subtotal</span>
              <span className="text-lg font-extrabold tabular-nums text-primary" aria-live="polite">{selectedTotal === 0 ? 'Free' : money(selectedTotal, 'GHS')}</span>
            </div>
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed"
              style={checkoutDisabled ? { opacity: 0.55, cursor: 'not-allowed', animation: 'none' } : undefined}
              disabled={checkoutDisabled}
              onClick={() => void placeOrder()}
            >
              {placing ? 'Reserving…' : selectedTotal === 0 ? 'Confirm free RSVP' : 'Continue to secure checkout'}
            </button>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {selectedTotal === 0
                ? 'Your free registration is confirmed only after the server issues tickets.'
                : 'Final total includes applicable processing fees and discount codes, calculated by the server. Reservations expire if payment is not completed.'}
            </p>
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

      {/* Waitlist join dialog */}
      <Dialog open={wlOpen} onOpenChange={setWlOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Join the waitlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              When a seat frees up (a cancellation or the organizer adding quota) we alert this list in order. First come, first served — nothing is held automatically.
            </p>
            {soldOutTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Interested in</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setWlType('')} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${wlType === '' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                    Any type
                  </button>
                  {soldOutTypes.map((tt) => (
                    <button key={tt.id} type="button" onClick={() => setWlType(tt.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${wlType === tt.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      {tt.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="efx-floating-label-input" style={{ margin: 0 }}>
              <input
                id="wl-name"
                className="efx-floating-label-input__field"
                placeholder=" "
                required
                value={wlForm.name}
                onChange={(e) => setWlForm((f) => ({ ...f, name: e.target.value }))}
                autoComplete="name"
              />
              <label htmlFor="wl-name" className="efx-floating-label-input__label">Your name</label>
            </div>
            <div className="efx-floating-label-input" style={{ margin: 0 }}>
              <input
                id="wl-contact"
                className="efx-floating-label-input__field"
                placeholder=" "
                required
                value={wlForm.contact}
                onChange={(e) => setWlForm((f) => ({ ...f, contact: e.target.value }))}
                autoComplete="email"
                inputMode="email"
              />
              <label htmlFor="wl-contact" className="efx-floating-label-input__label">Email or phone for the alert</label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Seats needed</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => setWlForm((f) => ({ ...f, partySize: n }))} className={`h-9 w-9 rounded-full border text-sm font-semibold transition-colors ${wlForm.partySize === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`} aria-pressed={wlForm.partySize === n}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWlOpen(false)}>Cancel</Button>
            <Button className="rounded-full" disabled={wlBusy || wlForm.name.trim().length < 2 || wlForm.contact.trim().length < 5} onClick={() => void joinWaitlist()}>
              {wlBusy ? 'Joining…' : 'Join waitlist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
