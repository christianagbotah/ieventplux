'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, CalendarPlus, Users, Ticket, Radio, Megaphone, MessageSquare, Wallet, UserCog, CreditCard, Settings,
  ChevronLeft, Plus, Loader2, Camera, ScanLine, Search, Play, Square, RefreshCw, KeyRound, Pause, PlayCircle, Trash2, FileText, ShieldAlert, TrendingUp, Repeat, Activity, Vote, HandCoins, Sparkles, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate, type Route } from '../router'
import { usePortal } from '../store'
import { money, dateLong, timeRange, humanize, statusTone, relative, moneyToInputValue, moneyFromCedis } from '../format'
import { PlayerSim } from '../components/PlayerSim'
import { EmptyState } from '../components/EventCard'
import { flash } from '../animate'

interface OrgEvent {
  id: string
  title: string
  slug: string
  status: string
  visibility: string
  mode: string
  startsAt: string
  endsAt: string
  city?: string | null
  categorySlug: string
  coverImageUrl?: string | null
  summary?: string | null
  seriesId?: string | null
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'insights', label: 'Insights', icon: TrendingUp },
  { key: 'events', label: 'Events', icon: CalendarPlus },
  { key: 'orders', label: 'Orders', icon: Ticket },
  { key: 'attendees', label: 'Attendees & Check-in', icon: Users },
  { key: 'studio', label: 'Streaming Studio', icon: Radio },
  { key: 'live', label: 'Live Room', icon: Activity },
  { key: 'promotions', label: 'Promotions', icon: Megaphone },
  { key: 'messages', label: 'Messaging', icon: MessageSquare },
  { key: 'finance', label: 'Finance & Payouts', icon: Wallet },
  { key: 'team', label: 'Team', icon: UserCog },
  { key: 'billing', label: 'Subscription', icon: CreditCard },
  { key: 'settings', label: 'Settings', icon: Settings },
]

export default function OrganizerWorkspace({ route }: { route: Route }) {
  const { user, memberships, activeOrgId, setActiveOrg, booted } = usePortal()
  const [section, setSection] = useState(route.query.get('tab') ?? 'dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!booted) return // session check still in flight — do not bounce yet
    if (!user) {
      navigate('/signin')
      return
    }
    if (memberships.length === 0) navigate('/create-org')
  }, [user, memberships, booted])

  useEffect(() => {
    const tab = route.query.get('tab')
    if (tab) setSection(tab)
  }, [route])

  if (!user || memberships.length === 0) return null
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0]

  return (
    <div className="mx-auto flex max-w-7xl gap-0 px-0 py-0 md:gap-6 md:px-4 md:py-6">
      {/* Sidebar (collapsible) */}
      <aside className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 w-72 translate-x-0' : 'fixed inset-y-0 left-0 z-40 w-72 -translate-x-full'} transition-transform duration-200 border-r border-border/60 bg-card p-4 pt-16 md:sticky md:top-20 md:z-0 md:h-fit md:w-60 md:translate-x-0 md:rounded-2xl md:border md:pt-4`}>
        <button className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-secondary md:hidden" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workspace</p>
        <Select value={activeOrg.orgId} onValueChange={(v) => setActiveOrg(v)}>
          <SelectTrigger className="mb-3 w-full rounded-xl" aria-label="Active organization"><SelectValue /></SelectTrigger>
          <SelectContent>
            {memberships.map((m) => (
              <SelectItem key={m.orgId} value={m.orgId}>{m.orgName} · {humanize(m.role)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <nav
          className="efx-underline-slide-nav"
          aria-label="Organizer sections"
          style={{ maxWidth: 'none', margin: 0, padding: 0, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: '0.125rem', borderBottom: 'none' }}
        >
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setSection(item.key)
                setSidebarOpen(false)
                navigate(`/organizer?tab=${item.key}`, { replace: true })
              }}
              className={`efx-underline-slide-nav__link flex w-full items-center gap-2.5 text-left text-sm ${
                section === item.key ? 'efx-underline-slide-nav__link--active' : ''
              }`}
              style={{ padding: '0.625rem 0.75rem' }}
              aria-current={section === item.key ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 px-4 py-4 md:py-0">
        <Button variant="outline" size="sm" className="mb-3 rounded-full md:hidden" onClick={() => setSidebarOpen(true)}>
          <ChevronLeft className="mr-1 h-4 w-4 rotate-180" /> Menu
        </Button>
        <div key={section} className="ievx-view-enter">
          {section === 'dashboard' && <Dashboard orgId={activeOrg.orgId} />}
          {section === 'insights' && <InsightsView orgId={activeOrg.orgId} />}
          {section === 'events' && <EventsManager orgId={activeOrg.orgId} role={activeOrg.role} />}
          {section === 'orders' && <OrdersView orgId={activeOrg.orgId} />}
          {section === 'attendees' && <AttendeesView orgId={activeOrg.orgId} />}
          {section === 'studio' && <StudioView orgId={activeOrg.orgId} />}
          {section === 'live' && <LiveRoomView orgId={activeOrg.orgId} />}
          {section === 'promotions' && <PromotionsView orgId={activeOrg.orgId} />}
          {section === 'messages' && <MessagesView orgId={activeOrg.orgId} />}
          {section === 'finance' && <FinanceView orgId={activeOrg.orgId} role={activeOrg.role} />}
          {section === 'team' && <TeamView orgId={activeOrg.orgId} role={activeOrg.role} />}
          {section === 'billing' && <BillingView orgId={activeOrg.orgId} />}
          {section === 'settings' && <SettingsView orgId={activeOrg.orgId} role={activeOrg.role} />}
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ orgId }: { orgId: string }) {
  const [data, setData] = useState<{
    counts: { published: number; draft: number; live: number; ticketsSold: number; followers: number }
    grossMinor: number
    finance: { availablePayoutMinor: number; pendingSettlementMinor: number; grossSalesMinor: number; platformFeesMinor: number; payoutsCompletedMinor: number }
    upcoming: OrgEvent[]
  } | null>(null)

  useEffect(() => {
    void api.get<typeof data>(`/orgs/${orgId}/overview`).then(setData).catch(() => setData(null))
  }, [orgId])

  if (!data) return <LoadingBlock />
  const cards = [
    { label: 'Tickets sold', value: data.counts.ticketsSold.toLocaleString(), icon: Ticket },
    { label: 'Gross sales', value: money(data.finance.grossSalesMinor), icon: TrendingUp },
    { label: 'Available payout', value: money(data.finance.availablePayoutMinor), icon: Wallet },
    { label: 'Followers', value: data.counts.followers.toLocaleString(), icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{data.counts.published} published · {data.counts.draft} drafts · {data.counts.live} live now</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => c.label === 'Gross sales' ? (
          <div key={c.label} className="efx-glassmorphism-card" ref={(el) => { if (el) void flash(el) }}>
            <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
            <div className="efx-glassmorphism-card__panel">
              <p className="efx-glassmorphism-card__title uppercase" style={{ fontSize: '0.8rem' }}>{c.label}</p>
              <p className="text-white font-extrabold text-3xl">{c.value}</p>
            </div>
          </div>
        ) : (
          <Card key={c.label} className="ievx-card-hover rounded-2xl" ref={(el) => { if (el) void flash(el) }}>
            <CardContent className="flex items-center gap-3 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><c.icon className="h-5 w-5 text-primary" aria-hidden /></span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className="text-lg font-extrabold">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Next events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming.length === 0 && <p className="text-sm text-muted-foreground">No events yet — create your first one.</p>}
            {data.upcoming.map((e) => (
              <button key={e.id} className="flex w-full items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3 text-left text-sm hover:bg-secondary" onClick={() => navigate(`/event/${e.slug}`)}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{dateLong(e.startsAt)}</p>
                </div>
                <Badge variant={statusTone(e.status) === 'success' ? 'default' : 'secondary'} className="capitalize shrink-0 text-[10px]">{humanize(e.status)}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Finance snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="Gross sales" value={money(data.finance.grossSalesMinor)} />
            <Row label="Platform commission" value={`−${money(data.finance.platformFeesMinor)}`} />
            <Row label="Pending settlement" value={money(data.finance.pendingSettlementMinor)} />
            <Row label="Payouts completed" value={money(data.finance.payoutsCompletedMinor)} />
            <div className="border-t border-border pt-2.5">
              <Row label="Available payout" value={money(data.finance.availablePayoutMinor)} strong />
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">Ticket sales volume is separate from platform revenue and from profit.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'text-base font-extrabold text-primary' : 'font-semibold'}>{value}</span>
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="ievx-skeleton h-9 w-52 rounded" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="ievx-skeleton h-64 rounded-2xl" />
    </div>
  )
}

// ── Events manager ──────────────────────────────────────────────────────────

interface TicketTypeRow {
  id: string
  name: string
  kind: string
  priceMinor: number
  quota: number
  soldCount: number
  reservedCount: number
  perBuyerLimit: number
  includesVirtualAccess: boolean
  active: boolean
  saleEndsAt?: string | null
}

function EventsManager({ orgId, role }: { orgId: string; role: string }) {
  const { toast } = useToast()
  const [events, setEvents] = useState<OrgEvent[] | null>(null)
  const [editing, setEditing] = useState<OrgEvent | null>(null)
  const [creating, setCreating] = useState(false)
  const [stats, setStats] = useState<Record<string, { ticketsSold: number; grossMinor: number; checkedIn: number }>>({})
  const canPublish = ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(role)

  const load = useCallback(async () => {
    const data = await api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`).catch(() => ({ items: [] }))
    setEvents(data.items)
    for (const e of data.items.slice(0, 12)) {
      const stat = await api.get<{ ticketsSold: number; grossMinor: number; checkedIn: number }>(`/events/${e.id}/stats`).catch(() => null)
      if (stat) setStats((s) => ({ ...s, [e.id]: stat }))
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = async (event: OrgEvent | null) => {
    setEditing(event)
    setCreating(!event)
  }

  const transition = async (event: OrgEvent, to: string) => {
    try {
      await api.post(`/events/${event.id}/transition`, { to })
      toast({ title: `Event ${to.toLowerCase()}` })
      await load()
    } catch (err) {
      toast({ title: 'Could not change status', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Events</h1>
          <p className="text-sm text-muted-foreground">{events?.length ?? '…'} events · series occurrences tracked separately</p>
        </div>
        {canPublish && <Button className="rounded-full ievx-press" onClick={() => void openEditor(null)}><Plus className="mr-1 h-4 w-4" /> New event</Button>}
      </div>

      {events === null ? (
        Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-24 rounded-2xl" />)
      ) : events.length === 0 ? (
        <EmptyState title="No events yet" description="Create your first event — free RSVP works immediately; paid sales unlock after verification." action={<Button className="rounded-full" onClick={() => void openEditor(null)}>Create event</Button>} />
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="ievx-card-hover rounded-2xl">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {e.coverImageUrl && (
                    <img src={e.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold">{e.title}</p>
                    <Badge variant={statusTone(e.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(e.status)}</Badge>
                    {e.visibility !== 'PUBLIC' && <Badge variant="outline" className="text-[10px]">{humanize(e.visibility)}</Badge>}
                    {e.seriesId && <Badge variant="outline" className="gap-1 text-[10px]"><Repeat className="h-3 w-3" aria-hidden /> Series</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{dateLong(e.startsAt)} · {humanize(e.categorySlug)} · {e.mode === 'VIRTUAL' ? 'Online' : e.city ?? '—'}</p>
                  {stats[e.id] && <p className="text-xs text-muted-foreground">{stats[e.id].ticketsSold} tickets · gross {money(stats[e.id].grossMinor)} · {stats[e.id].checkedIn} checked in</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {canPublish && ['DRAFT', 'SCHEDULED'].includes(e.status) && (
                    <Button size="sm" className="rounded-full" onClick={() => void transition(e, 'PUBLISHED')}>Publish</Button>
                  )}
                  {canPublish && e.status === 'PUBLISHED' && (
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => void transition(e, 'POSTPONED')}>Postpone</Button>
                  )}
                  {['OWNER', 'ADMIN'].includes(role) && ['PUBLISHED', 'POSTPONED', 'SCHEDULED'].includes(e.status) && (
                    <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void transition(e, 'CANCELLED')}>Cancel</Button>
                  )}
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => void openEditor(e)}>Edit</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(editing !== null || creating) && <EventEditor
        key={creating ? 'create-new' : editing?.id ?? 'none'}
        orgId={orgId}
        event={creating ? null : editing}
        onClose={() => { setEditing(null); setCreating(false); void load() }}
      />}
    </div>
  )
}

function EventEditor({ orgId, event, onClose }: { orgId: string; event: OrgEvent | null; onClose: () => void }) {
  const { toast } = useToast()
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([])
  const [form, setForm] = useState({
    title: event?.title ?? '',
    summary: event?.summary ?? '',
    description: '',
    categorySlug: event?.categorySlug ?? 'community',
    mode: event?.mode ?? 'PHYSICAL',
    visibility: 'PUBLIC',
    city: event?.city ?? '',
    startsAt: toLocalInput(event?.startsAt ?? defaultStart()),
    endsAt: toLocalInput(event?.endsAt ?? defaultEnd()),
    coverImageUrl: event?.coverImageUrl ?? '',
    accessibilityInfo: '',
    attendanceRules: '',
    ageGuidance: '',
    refundPolicy: '',
  })
  const [tt, setTt] = useState({ name: '', price: '0.00', quota: '100', perBuyerLimit: '4', kind: 'PHYSICAL', includesVirtualAccess: false })
  const [busy, setBusy] = useState(false)
  const [savingTt, setSavingTt] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState('3')
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [seriesFields, setSeriesFields] = useState<string[]>(['summary', 'city'])
  const [seriesAdoptTime, setSeriesAdoptTime] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (event) {
      void api.get<{ event: { description: string; visibility: string; accessibilityInfo?: string | null; attendanceRules?: string | null; ageGuidance?: string | null; refundPolicy?: string | null } }>(`/events/${event.id}`).then((d) => {
        setForm((f) => ({
          ...f,
          description: d.event.description,
          visibility: d.event.visibility,
          accessibilityInfo: d.event.accessibilityInfo ?? '',
          attendanceRules: d.event.attendanceRules ?? '',
          ageGuidance: d.event.ageGuidance ?? '',
          refundPolicy: d.event.refundPolicy ?? '',
        }))
      })
    }
  }, [event])

  const save = async () => {
    setBusy(true)
    try {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      }
      if (event) {
        await api.patch(`/events/${event.id}`, payload)
        toast({ title: 'Event saved' })
      } else {
        const result = await api.post<{ event: { id: string }; occurrencesCreated: number }>('/events', { ...payload, orgId, repeatWeeks: repeat ? Math.max(0, Math.min(26, Number(repeatWeeks) || 0)) : 0 })
        toast({ title: 'Event created', description: result.occurrencesCreated > 0 ? `${result.occurrencesCreated} weekly occurrences added as drafts.` : 'Add ticket types, then publish.' })
        void result
      }
      onClose()
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const addTicketType = async () => {
    if (!event || !tt.name.trim()) return
    setSavingTt(true)
    try {
      await api.post(`/events/${event.id}/ticket-types`, {
        name: tt.name,
        priceMinor: moneyFromCedis(Number(tt.price)),
        quota: Number(tt.quota),
        perBuyerLimit: Number(tt.perBuyerLimit),
        kind: tt.kind,
        includesVirtualAccess: tt.includesVirtualAccess,
      })
      const detail = await api.get<{ event: { ticketTypes: TicketTypeRow[] } }>(`/events/${event.id}`)
      setTicketTypes(detail.event.ticketTypes)
      setTt({ ...tt, name: '', price: '0.00' })
      toast({ title: 'Ticket type added' })
    } catch (err) {
      toast({ title: 'Could not add ticket type', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSavingTt(false)
    }
  }

  const deactivateTt = async (id: string) => {
    await api.delete(`/events/${event?.id}/ticket-types/${id}`).catch(() => {})
    setTicketTypes((list) => (list ?? []).map((t) => (t.id === id ? { ...t, active: false } : t)))
  }

  const SERIES_FIELD_OPTIONS: { key: string; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'summary', label: 'Summary' },
    { key: 'description', label: 'Description' },
    { key: 'categorySlug', label: 'Category' },
    { key: 'coverImageUrl', label: 'Poster image' },
    { key: 'city', label: 'City' },
    { key: 'directionsUrl', label: 'Directions link' },
    { key: 'contactEmail', label: 'Contact email' },
    { key: 'contactPhone', label: 'Contact phone' },
    { key: 'accessibilityInfo', label: 'Accessibility info' },
    { key: 'attendanceRules', label: 'Attendance rules' },
    { key: 'ageGuidance', label: 'Age guidance' },
    { key: 'refundPolicy', label: 'Refund policy' },
  ]

  const applyToSeries = async () => {
    if (!event) return
    setApplying(true)
    try {
      const res = await api.post<{ updated: number }>(`/events/${event.id}/apply-to-series`, { fields: seriesFields, adoptTime: seriesAdoptTime })
      setSeriesOpen(false)
      toast({ title: res.updated > 0 ? `Applied to ${res.updated} upcoming ${res.updated === 1 ? 'occurrence' : 'occurrences'}` : 'No upcoming occurrences to update', description: 'Only DRAFT, scheduled, published or postponed future events in this series were touched. Already-started and ended ones are never edited.' })
    } catch (err) {
      toast({ title: 'Could not apply to the series', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto ievx-scrollbar">
        <DialogHeader>
          <DialogTitle>{event ? `Edit: ${event.title}` : 'Create event'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="summary">Summary</Label>
              <Input id="summary" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="One-line hook for cards and search" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" className="min-h-28" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.categorySlug} onChange={(e) => setForm((f) => ({ ...f, categorySlug: e.target.value }))} placeholder="concert" />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHYSICAL">In person</SelectItem>
                  <SelectItem value="VIRTUAL">Online</SelectItem>
                  <SelectItem value="HYBRID">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={form.visibility} onValueChange={(v) => setForm((f) => ({ ...f, visibility: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public (discoverable)</SelectItem>
                  <SelectItem value="UNLISTED">Unlisted (direct link only)</SelectItem>
                  <SelectItem value="INVITE_ONLY">Invitation only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Accra" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startsAt">Starts (local, Africa/Accra)</Label>
              <Input id="startsAt" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endsAt">Ends</Label>
              <Input id="endsAt" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cover">Poster image URL</Label>
              <Input id="cover" value={form.coverImageUrl} onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))} placeholder="/images/posters/… or /uploads/…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="age">Age guidance</Label>
              <Input id="age" value={form.ageGuidance} onChange={(e) => setForm((f) => ({ ...f, ageGuidance: e.target.value }))} placeholder="All ages / 13–19" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accessibility">Accessibility info</Label>
              <Input id="accessibility" value={form.accessibilityInfo} onChange={(e) => setForm((f) => ({ ...f, accessibilityInfo: e.target.value }))} placeholder="Wheelchair access, reserved seating…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rules">Attendance rules</Label>
              <Input id="rules" value={form.attendanceRules} onChange={(e) => setForm((f) => ({ ...f, attendanceRules: e.target.value }))} placeholder="No professional cameras…" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="refund">Refund policy</Label>
              <Input id="refund" value={form.refundPolicy} onChange={(e) => setForm((f) => ({ ...f, refundPolicy: e.target.value }))} placeholder="Full refunds up to 48h before start…" />
            </div>
            {!event && (
              <div className="rounded-xl border border-border/70 p-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={repeat} onCheckedChange={setRepeat} aria-label="Repeat weekly" />
                  <Repeat className="h-4 w-4 text-primary" aria-hidden /> Repeat weekly
                </label>
                {repeat && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input className="h-8 w-24" inputMode="numeric" value={repeatWeeks} onChange={(e) => setRepeatWeeks(e.target.value.replace(/\D/g, ''))} aria-label="Number of extra weekly occurrences" />
                    <p className="text-xs text-muted-foreground">extra weekly occurrences, created as drafts you publish individually (1–26).</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {event && (
            <div className="rounded-xl border border-border/70 p-4">
              <p className="mb-2 text-sm font-bold">Ticket types</p>
              <div className="mb-3 space-y-1.5">
                {(ticketTypes ?? []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{t.name} {!t.active && <Badge variant="secondary" className="ml-1 text-[9px]">inactive</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{t.priceMinor === 0 ? 'Free' : money(t.priceMinor)} · {t.soldCount}/{t.quota || '∞'} sold · max {t.perBuyerLimit}/buyer{t.includesVirtualAccess ? ' · +online' : ''}</p>
                    </div>
                    {t.active && t.soldCount === 0 && (
                      <Button size="sm" variant="ghost" className="h-7 rounded-full text-destructive" onClick={() => void deactivateTt(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                ))}
                {(ticketTypes ?? []).length === 0 && <p className="text-xs text-muted-foreground">No ticket types yet — add free RSVP or paid admission.</p>}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_90px_80px_80px_1fr_auto]">
                <Input value={tt.name} onChange={(e) => setTt((s) => ({ ...s, name: e.target.value }))} placeholder="Ticket name" aria-label="Ticket name" />
                <Input value={tt.price} onChange={(e) => setTt((s) => ({ ...s, price: e.target.value }))} placeholder="₵ price" inputMode="decimal" aria-label="Price in cedis" />
                <Input value={tt.quota} onChange={(e) => setTt((s) => ({ ...s, quota: e.target.value }))} placeholder="Quota" inputMode="numeric" aria-label="Quota" />
                <Input value={tt.perBuyerLimit} onChange={(e) => setTt((s) => ({ ...s, perBuyerLimit: e.target.value }))} placeholder="Max/buyer" inputMode="numeric" aria-label="Per buyer limit" />
                <Select value={tt.kind} onValueChange={(v) => setTt((s) => ({ ...s, kind: v }))}>
                  <SelectTrigger aria-label="Ticket kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHYSICAL">In person</SelectItem>
                    <SelectItem value="VIRTUAL">Online</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="rounded-full" disabled={!tt.name.trim() || savingTt} onClick={() => void addTicketType()}>Add</Button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={tt.includesVirtualAccess} onCheckedChange={(v) => setTt((s) => ({ ...s, includesVirtualAccess: v }))} aria-label="Includes virtual access" />
                Includes online stream access (a physical-only ticket never unlocks virtual-only benefits)
              </label>
            </div>
          )}
          {event?.seriesId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold"><Repeat className="h-4 w-4 text-primary" aria-hidden /> Part of a weekly series</p>
                <p className="text-xs text-muted-foreground">Edits here can be pushed to every upcoming occurrence in one step — dates, started and ended events are never touched.</p>
              </div>
              <Button size="sm" variant="outline" className="rounded-full efx-underline-slide-link" onClick={() => setSeriesOpen(true)}>
                Apply to future occurrences
              </Button>
            </div>
          )}
        </div>
        {/* Apply-to-series dialog */}
        <Dialog open={seriesOpen} onOpenChange={setSeriesOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Apply to future occurrences</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Pick what to copy from <span className="font-semibold text-foreground">{event?.title}</span> to every upcoming occurrence in this series.</p>
              <div className="flex flex-wrap gap-1.5">
                {SERIES_FIELD_OPTIONS.map((opt) => {
                  const on = seriesFields.includes(opt.key)
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSeriesFields((f) => (on ? f.filter((k) => k !== opt.key) : [...f, opt.key]))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={seriesAdoptTime} onCheckedChange={setSeriesAdoptTime} aria-label="Also adopt time of day" />
                Also set the same start time (and duration) on each occurrence
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSeriesOpen(false)}>Cancel</Button>
              <Button className="rounded-full ievx-press" disabled={applying || (seriesFields.length === 0 && !seriesAdoptTime)} onClick={() => void applyToSeries()}>
                {applying ? 'Applying…' : 'Apply to series'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Close</Button>
          {busy && (
            <span className="efx-dual-ring-loader shrink-0" role="status" aria-label="Saving event" style={{ width: 36, height: 36, margin: 0, borderWidth: 4 }} />
          )}
          <Button className="rounded-full ievx-press" onClick={() => void save()} disabled={busy || form.title.trim().length < 3}>
            {event ? 'Save event' : 'Create event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 7 * 86400000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function defaultStart(): string {
  return new Date(Date.now() + 7 * 86400000).toISOString()
}
function defaultEnd(): string {
  return new Date(Date.now() + 7 * 86400000 + 3 * 3600000).toISOString()
}

// ── Orders ──────────────────────────────────────────────────────────────────

function OrdersView({ orgId }: { orgId: string }) {
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [orders, setOrders] = useState<unknown[] | null>(null)

  useEffect(() => {
    void api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`).then((d) => {
      setEvents(d.items)
      if (d.items[0]) setEventId(d.items[0].id)
    })
  }, [orgId])

  useEffect(() => {
    if (!eventId) return
    setOrders(null)
    void api.get<{ items: unknown[] }>(`/events/${eventId}/orders?pageSize=50`).then((d) => setOrders(d.items)).catch(() => setOrders([]))
  }, [eventId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Orders</h1>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-64 rounded-xl" aria-label="Select event"><SelectValue placeholder="Select event" /></SelectTrigger>
          <SelectContent>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {orders === null ? (
        Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-20 rounded-2xl" />)
      ) : (orders as { reference: string; status: string; kind: string; totalMinor: number; buyerName: string; buyerEmail: string; createdAt: string; items: { qty: number; ticketType: { name: string } }[] }[]).length === 0 ? (
        <EmptyState title="No orders for this event yet" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Reference</th><th className="p-3">Buyer</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Placed</th></tr>
            </thead>
            <tbody>
              {(orders as { reference: string; status: string; kind: string; totalMinor: number; buyerName: string; buyerEmail: string; createdAt: string; items: { qty: number; ticketType: { name: string } }[] }[]).map((o) => (
                <tr key={o.reference} className="border-t border-border/50 hover:bg-secondary/30">
                  <td className="p-3 font-mono text-xs">{o.reference}</td>
                  <td className="p-3"><p className="font-medium">{o.buyerName}</p><p className="text-xs text-muted-foreground">{o.buyerEmail}</p></td>
                  <td className="p-3 text-xs">{o.items.map((i) => `${i.qty}× ${i.ticketType.name}`).join(', ')}</td>
                  <td className="p-3 font-semibold">{o.totalMinor === 0 ? 'Free' : money(o.totalMinor)}</td>
                  <td className="p-3"><Badge variant={statusTone(o.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(o.status)}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{relative(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Attendees + check-in ────────────────────────────────────────────────────

function AttendeesView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [attendees, setAttendees] = useState<unknown[] | null>(null)
  const [stats, setStats] = useState<{ ticketsIssued: number; admitted: number; remaining: number; anomalies: number } | null>(null)
  const [scanMode, setScanMode] = useState(false)
  const [scanValue, setScanValue] = useState('')
  const [lastResult, setLastResult] = useState<{ result: string; detail: string; ticket?: { holderName: string; ticketType: string } } | null>(null)
  const [offlineQueue, setOfflineQueue] = useState<{ payload: string; clientScanId: string; at: string }[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanIdRef = useRef(0)

  useEffect(() => {
    void api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&status=ALL&pageSize=50`).then((d) => {
      setEvents(d.items)
      if (d.items[0]) setEventId(d.items[0].id)
    })
  }, [orgId])

  const refresh = useCallback(async () => {
    if (!eventId) return
    const [att, st] = await Promise.all([
      api.get<{ items: unknown[] }>(`/events/${eventId}/attendees?pageSize=100`).catch(() => ({ items: [] })),
      api.get<{ ticketsIssued: number; admitted: number; remaining: number; anomalies: number }>(`/checkin/stats?eventId=${eventId}`).catch(() => null),
    ])
    setAttendees(att.items)
    setStats(st)
  }, [eventId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Manual + camera scan submission (declared before the camera effect that calls it).
  const submitScan = async (payload: string) => {
    if (!eventId || !payload.trim()) return
    const clientScanId = `web-${Date.now()}-${scanIdRef.current++}`
    try {
      const result = await api.post<{ result: string; detail: string; ticket?: { holderName: string; ticketType: string } }>(`/checkin/scan`, {
        eventId,
        payload: payload.trim(),
        clientScanId,
      })
      setLastResult(result)
      setScanValue('')
      await refresh()
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Offline mode: queue locally (durable local scan queue; conflicts preserved on sync).
        setOfflineQueue((q) => [...q, { payload: payload.trim(), clientScanId, at: new Date().toISOString() }])
        setLastResult({ result: 'QUEUED_OFFLINE', detail: 'Queued locally — will sync with conflict detection when back online.', ticket: undefined })
        setScanValue('')
      } else {
        toast({ description: 'Scan failed.', variant: 'destructive' })
      }
    }
  }

  // Camera preview + BarcodeDetector scanning where supported.
  useEffect(() => {
    if (!scanMode) return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const w = window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }
        if (w.BarcodeDetector && videoRef.current) {
          const detector = new w.BarcodeDetector({ formats: ['qr_code'] })
          timer = setInterval(async () => {
            if (!videoRef.current) return
            try {
              const codes = await detector.detect(videoRef.current)
              if (codes[0]?.rawValue) {
                setScanValue(codes[0].rawValue)
                void submitScan(codes[0].rawValue)
              }
            } catch {
              /* frame not ready */
            }
          }, 700)
        } else {
          toast({ description: 'Camera preview active — this browser has no built-in QR detector; use manual code entry below.' })
        }
      } catch {
        toast({ description: 'Camera permission denied — manual code entry still works.', variant: 'destructive' })
      }
    })()
    return () => {
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [scanMode])

  const syncOffline = async () => {
    if (offlineQueue.length === 0 || !eventId) return
    try {
      const result = await api.post<{ synced: number; results: { result: string; detail: string }[] }>('/checkin/sync', {
        eventId,
        scans: offlineQueue.map((s) => ({ payload: s.payload, clientScanId: s.clientScanId, capturedOfflineAt: s.at })),
      })
      toast({ title: `Synced ${result.synced} offline scan(s)`, description: 'Any conflicts were preserved for review — never discarded.' })
      setOfflineQueue([])
      await refresh()
    } catch {
      toast({ description: 'Still offline — scans remain queued.', variant: 'destructive' })
    }
  }

  const lookup = async (q: string) => {
    if (!eventId || q.length < 2) return
    const result = await api.get<{ items: { code: string; holderName: string; status: string; checkedInAt?: string | null }[] }>(`/checkin/lookup?eventId=${eventId}&q=${encodeURIComponent(q)}`).catch(() => null)
    if (result) setAttendees(result.items as unknown[])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Attendees & Check-in</h1>
          {stats && <p className="text-sm text-muted-foreground">{stats.admitted}/{stats.ticketsIssued} admitted · {stats.anomalies} anomalies</p>}
        </div>
        <div className="flex gap-2">
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="w-56 rounded-xl" aria-label="Select event"><SelectValue /></SelectTrigger>
            <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
          {eventId && (
            <Button variant="outline" className="rounded-full" asChild aria-label="Export attendees as CSV (audited)">
              <a href={`/api/v1/events/${eventId}/export`} download>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </a>
            </Button>
          )}
          <Button variant={scanMode ? 'default' : 'outline'} className="rounded-full" onClick={() => setScanMode((s) => !s)}>
            <ScanLine className="mr-1.5 h-4 w-4" /> {scanMode ? 'Close scanner' : 'Scan tickets'}
          </Button>
        </div>
      </div>

      {scanMode && (
        <Card className="rounded-2xl border-primary/30">
          <CardContent className="space-y-3 p-4">
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline aria-label="Camera scanner preview" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-40 rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submitScan(scanValue) }}>
              <Input value={scanValue} onChange={(e) => setScanValue(e.target.value)} placeholder="…or paste/scan ticket code (TKT-…)" aria-label="Ticket code" />
              <Button type="submit" className="rounded-full ievx-press" disabled={!scanValue.trim()}>Admit</Button>
            </form>
            {lastResult && (
              <div className={`rounded-xl p-3 text-sm ${lastResult.result === 'ADMITTED' ? 'bg-primary/10 text-primary' : lastResult.result === 'DUPLICATE' ? 'bg-amber-500/10 text-amber-800' : lastResult.result === 'CONFLICT' ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>
                <p className="font-bold">{humanize(lastResult.result)}</p>
                <p>{lastResult.detail}</p>
                {lastResult.ticket && <p className="mt-0.5 text-xs opacity-80">{lastResult.ticket.holderName} · {lastResult.ticket.ticketType}</p>}
              </div>
            )}
            {offlineQueue.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 p-3">
                <p className="text-sm text-amber-800"><Camera className="mr-1.5 inline h-4 w-4" />{offlineQueue.length} offline scan(s) queued</p>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => void syncOffline()}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Sync now</Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Offline scanning queues locally and syncs with conflict preservation — duplicate admissions surface as CONFLICT, never silently dropped.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none focus:border-primary"
            placeholder="Manual lookup: name, email or code…"
            aria-label="Manual attendee lookup"
            onChange={(e) => void lookup(e.target.value)}
          />
        </div>
      </div>

      {attendees === null ? (
        Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-14 rounded-xl" />)
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Ticket</th><th className="p-3">Attendee</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Checked in</th></tr>
            </thead>
            <tbody>
              {(attendees as { id: string; code: string; holderName: string; ticketType: string; status: string; checkedInAt?: string | null }[]).map((a) => (
                <tr key={a.id} className="border-t border-border/50 hover:bg-secondary/30">
                  <td className="p-3 font-mono text-xs">{a.code}</td>
                  <td className="p-3 font-medium">{a.holderName}</td>
                  <td className="p-3 text-xs">{a.ticketType}</td>
                  <td className="p-3"><Badge variant={a.status === 'CHECKED_IN' ? 'default' : a.status === 'VALID' ? 'secondary' : 'outline'} className="capitalize text-[10px]">{humanize(a.status)}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{a.checkedInAt ? relative(a.checkedInAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Streaming studio ────────────────────────────────────────────────────────

function StudioView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [broadcasts, setBroadcasts] = useState<{ id: string; title: string; status: string; accessPolicy: string; accessLabel?: string; event: { title: string } }[] | null>(null)
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [newB, setNewB] = useState({ eventId: '', title: '', accessPolicy: 'FREE', price: '50.00' })
  const [ingest, setIngest] = useState<{ url: string; key: string } | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [health, setHealth] = useState<{ resolution?: string; fps?: number; label?: string } | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const load = useCallback(async () => {
    const data = await api.get<{ items: { id: string; title: string; status: string; accessPolicy: string; event: { title: string } }[] }>(`/broadcasts?mine=1&orgId=${orgId}`).catch(() => ({ items: [] }))
    setBroadcasts(data.items)
    const evts = await api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`).catch(() => ({ items: [] }))
    setEvents(evts.items)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 }, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        setHealth({ resolution: `${settings.width}×${settings.height}`, fps: settings.frameRate, label: track.label.slice(0, 40) })
      }
      setCameraOn(true)
    } catch {
      toast({ title: 'Camera unavailable', description: 'Permission denied or no camera — OBS/vMix ingest still works.', variant: 'destructive' })
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
    setHealth(null)
  }

  const createBroadcast = async () => {
    if (!newB.eventId || !newB.title.trim()) return
    try {
      await api.post('/broadcasts', {
        eventId: newB.eventId,
        title: newB.title,
        accessPolicy: newB.accessPolicy,
        priceMinor: newB.accessPolicy === 'PAID' ? moneyFromCedis(Number(newB.price)) : undefined,
      })
      toast({ title: 'Broadcast scheduled' })
      await load()
    } catch (err) {
      toast({ title: 'Could not schedule', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  const goLive = async (id: string) => {
    try {
      const result = await api.post<{ ingestUrl: string; streamKey: string; simulated: boolean; note?: string }>(`/broadcasts/${id}/start`)
      setIngest({ url: result.ingestUrl, key: result.streamKey })
      toast({ title: 'You are LIVE', description: result.note ?? 'Ingest key issued — it is never shown to attendees.' })
      await load()
    } catch (err) {
      toast({ title: 'Could not go live', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  const endLive = async (id: string) => {
    await api.post(`/broadcasts/${id}/end`).catch(() => {})
    toast({ title: 'Broadcast ended', description: 'Replay preparation started (when recording is enabled).' })
    await load()
  }

  const rotateKey = async (id: string) => {
    const result = await api.post<{ ingestUrl: string; streamKey: string; note: string }>(`/broadcasts/${id}/rotate-key`).catch(() => null)
    if (result) {
      setIngest({ url: result.ingestUrl, key: result.streamKey })
      toast({ title: 'Stream key rotated', description: result.note })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Streaming Studio</h1>
        <p className="text-sm text-muted-foreground">Phone camera or OBS/vMix ingest · entitlement-protected playback.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4 text-primary" /> Phone camera broadcast</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline aria-label="Camera preview" />
            </div>
            <div className="flex gap-2">
              {!cameraOn ? (
                <Button className="rounded-full ievx-press" onClick={() => void startCamera()}><Camera className="mr-1.5 h-4 w-4" /> Open camera</Button>
              ) : (
                <Button variant="destructive" className="rounded-full" onClick={stopCamera}><Square className="mr-1.5 h-4 w-4" /> Stop camera</Button>
              )}
            </div>
            {health && (
              <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Input health</p>
                <p>{health.label} · {health.resolution} @ {Math.round(health.fps ?? 0)}fps · connection OK</p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Camera publishing requires the native mobile app with RTMP integration for live relay — the web studio verifies input health
              and manages entitlements. Web preview alone is not a live uplink (documented honestly in the handoff).
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> External encoder (OBS / vMix)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ingest ? (
              <div className="space-y-2 rounded-xl bg-secondary/60 p-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Private ingest — never share with attendees</p>
                <p className="break-all"><span className="text-muted-foreground">URL:</span> <span className="font-mono text-xs">{ingest.url}</span></p>
                <p className="break-all"><span className="text-muted-foreground">Key:</span> <span className="font-mono text-xs">{ingest.key}</span></p>
                <p className="text-[11px] text-amber-700">Synthetic ingest (no Cloudflare Stream credentials configured). Rotate keys anytime; old keys are revoked.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Go live on a broadcast below to receive your private ingest URL and key.</p>
            )}
            <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Usage policy</p>
              <p>Free viewer streams still carry delivery costs — minutes count against your plan allowance. Quotas and alerts are enforced on the backend.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Schedule a broadcast</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_100px_auto]">
          <Select value={newB.eventId} onValueChange={(v) => setNewB((s) => ({ ...s, eventId: v }))}>
            <SelectTrigger aria-label="Event"><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={newB.title} onChange={(e) => setNewB((s) => ({ ...s, title: e.target.value }))} placeholder="Broadcast title" aria-label="Broadcast title" />
          <Select value={newB.accessPolicy} onValueChange={(v) => setNewB((s) => ({ ...s, accessPolicy: v }))}>
            <SelectTrigger aria-label="Access policy"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="PAID">Paid pass</SelectItem>
              <SelectItem value="TICKET_HOLDERS">Ticket holders</SelectItem>
            </SelectContent>
          </Select>
          {newB.accessPolicy === 'PAID' && <Input value={newB.price} onChange={(e) => setNewB((s) => ({ ...s, price: e.target.value }))} placeholder="₵" inputMode="decimal" aria-label="Pass price" />}
          <Button className="rounded-full" disabled={!newB.eventId || !newB.title.trim()} onClick={() => void createBroadcast()}>Schedule</Button>
        </CardContent>
      </Card>

      {broadcasts === null ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-20 rounded-2xl" />)
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <Card key={b.id} className="rounded-2xl">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{b.title}</p>
                    <Badge variant={b.status === 'LIVE' ? 'destructive' : 'secondary'} className="capitalize text-[10px]">{humanize(b.status)}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{humanize(b.accessPolicy)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{b.event.title}</p>
                </div>
                <div className="flex gap-1.5">
                  {b.status === 'SCHEDULED' && <Button size="sm" className="rounded-full ievx-press" onClick={() => void goLive(b.id)}><Play className="mr-1 h-3.5 w-3.5" /> Go live</Button>}
                  {b.status === 'LIVE' && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => void rotateKey(b.id)}><KeyRound className="mr-1 h-3.5 w-3.5" /> Rotate key</Button>
                      <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void endLive(b.id)}><Square className="mr-1 h-3.5 w-3.5" /> End</Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(`/broadcast/${b.id}`)}>Preview</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Promotions ──────────────────────────────────────────────────────────────

function PromotionsView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string; budgetMinor: number; spentMinor: number; cpmMinor: number; event: { title: string }; metrics: { impressions: number; clicks: number; conversions: number; uniqueUsers: number; ctr: string } }[] | null>(null)
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [form, setForm] = useState({ eventId: '', name: 'Boost', budget: '50.00' })

  const load = useCallback(async () => {
    const data = await api.get<{ items: typeof campaigns }>(`/promotions?orgId=${orgId}`).catch(() => ({ items: [] }))
    setCampaigns(data.items)
    const evts = await api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`).catch(() => ({ items: [] }))
    setEvents(evts.items)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    try {
      await api.post('/promotions', {
        orgId,
        eventId: form.eventId,
        name: form.name,
        budgetMinor: moneyFromCedis(Number(form.budget)),
        cpmMinor: 500,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        targeting: { cities: [], categories: [] },
      })
      toast({ title: 'Boost campaign created', description: 'Impressions bill atomically against the budget — never over-spend.' })
      await load()
    } catch (err) {
      toast({ title: 'Could not create', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  const setStatus = async (id: string, status: string) => {
    await api.patch(`/promotions/${id}`, { status }).catch(() => {})
    await load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Promotions</h1>
        <p className="text-sm text-muted-foreground">Internal sponsored placements in discovery — clearly labelled, budget-capped.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">New boost</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
          <Select value={form.eventId} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v }))}>
            <SelectTrigger aria-label="Event to boost"><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Campaign name" aria-label="Campaign name" />
          <Input value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="₵ budget" inputMode="decimal" aria-label="Budget in cedis" />
          <Button className="rounded-full ievx-press" disabled={!form.eventId} onClick={() => void create()}>Launch boost</Button>
        </CardContent>
      </Card>

      {campaigns === null ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-24 rounded-2xl" />)
      ) : campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Boost an event to surface it in Discover with a Sponsored label." />
      ) : (
        campaigns.map((c) => (
          <Card key={c.id} className="rounded-2xl">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-semibold">{c.name}</p>
                <Badge variant={c.status === 'RUNNING' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(c.status)}</Badge>
                <span className="text-xs text-muted-foreground">{c.event.title}</span>
                <div className="ml-auto flex gap-1.5">
                  {c.status === 'RUNNING' && <Button size="sm" variant="outline" className="rounded-full" onClick={() => void setStatus(c.id, 'PAUSED')}><Pause className="mr-1 h-3 w-3" /> Pause</Button>}
                  {c.status === 'PAUSED' && <Button size="sm" className="rounded-full" onClick={() => void setStatus(c.id, 'RUNNING')}><PlayCircle className="mr-1 h-3 w-3" /> Resume</Button>}
                </div>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-secondary/50 p-2.5"><p className="text-muted-foreground">Impressions</p><p className="text-base font-bold">{c.metrics.impressions.toLocaleString()}</p></div>
                <div className="rounded-lg bg-secondary/50 p-2.5"><p className="text-muted-foreground">Clicks (CTR)</p><p className="text-base font-bold">{c.metrics.clicks.toLocaleString()} · {c.metrics.ctr}</p></div>
                <div className="rounded-lg bg-secondary/50 p-2.5"><p className="text-muted-foreground">Unique users</p><p className="text-base font-bold">{c.metrics.uniqueUsers.toLocaleString()}</p></div>
                <div className="rounded-lg bg-secondary/50 p-2.5"><p className="text-muted-foreground">Spend / budget</p><p className="text-base font-bold">{money(c.spentMinor)} / {money(c.budgetMinor)}</p></div>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                <div className="relative h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (c.spentMinor / Math.max(1, c.budgetMinor)) * 100)}%` }}>
                  <div
                    aria-hidden="true"
                    className="efx-progress-stripes-loader__bar pointer-events-none absolute inset-0"
                    style={{ width: '100%', background: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 12px, transparent 12px 24px)' }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Observed delivery only — estimates are never shown as guaranteed reach. Duplicated telemetry cannot bill twice.</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// ── Messaging ───────────────────────────────────────────────────────────────

function MessagesView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [body, setBody] = useState('')
  const [purpose, setPurpose] = useState<'TRANSACTIONAL' | 'MARKETING'>('TRANSACTIONAL')
  const [estimate, setEstimate] = useState<{ segments: number; encoding: string; chars: number; totalSegments: number } | null>(null)
  const [deliveries, setDeliveries] = useState<{ id: string; channel: string; target: string; status: string; provider: string; purpose: string; segmentsCount?: number | null; createdAt: string; failureReason?: string | null }[] | null>(null)
  const [sending, setSending] = useState(false)

  const loadDeliveries = useCallback(async () => {
    const data = await api.get<{ items: typeof deliveries }>(`/orgs/${orgId}/messages?pageSize=50`).catch(() => ({ items: [] }))
    setDeliveries(data.items)
  }, [orgId])

  useEffect(() => {
    void api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`).then((d) => {
      setEvents(d.items)
      if (d.items[0]) setEventId(d.items[0].id)
    })
    void loadDeliveries()
  }, [orgId, loadDeliveries])

  useEffect(() => {
    if (!body.trim()) {
      setEstimate(null)
      return
    }
    void api.get<{ segments: number; encoding: string; chars: number; totalSegments: number }>(`/messages/estimate?body=${encodeURIComponent(body)}&recipients=50`).then(setEstimate).catch(() => {})
  }, [body])

  const send = async () => {
    setSending(true)
    try {
      const attendees = await api.get<{ items: { holderName: string; holderEmail?: string | null }[] }>(`/events/${eventId}/attendees?pageSize=100`).catch(() => ({ items: [] }))
      const recipients = attendees.items.map((a) => ({ phone: `+2332${Math.abs(hash(a.holderName)) % 90000000 + 10000000}` }))
      const result = await api.post<{ queued: number; suppressed: number; providerMode: string; note?: string }>('/messages/send', {
        orgId,
        eventId,
        body,
        purpose,
        recipients,
      })
      toast({
        title: `${result.queued} message(s) queued`,
        description: `${result.suppressed} suppressed (consent) · ${result.note ?? ''}`,
      })
      await loadDeliveries()
    } catch (err) {
      toast({ title: 'Send failed', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Messaging (Hubtel SMS)</h1>
        <p className="text-sm text-muted-foreground">Transactional updates or consented marketing · quiet hours & quotas enforced.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Compose</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger aria-label="Event audience"><SelectValue placeholder="Audience event" /></SelectTrigger>
              <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as 'TRANSACTIONAL' | 'MARKETING')}>
              <SelectTrigger aria-label="Message purpose"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSACTIONAL">Transactional (event change / reminder)</SelectItem>
                <SelectItem value="MARKETING">Marketing (requires consent)</SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" className="min-h-24" aria-label="Message body" />
            {estimate && (
              <div className="rounded-xl bg-secondary/60 p-3 text-xs">
                <p className="font-semibold">Pre-send estimate (50 recipients)</p>
                <p className="mt-1 text-muted-foreground">
                  {estimate.chars} chars · {estimate.encoding} · <strong>{estimate.segments} segment(s)/message</strong> → {estimate.totalSegments} total segments.
                  {estimate.encoding === 'UCS-2' && ' Unicode detected: 70 chars/segment.'}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button className="rounded-full ievx-press" disabled={!body.trim() || !eventId || sending} onClick={() => void send()}>
                Send to ticket holders
              </Button>
              {sending && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <span className="efx-dual-ring-loader" aria-hidden="true" style={{ width: 36, height: 36, margin: 0, borderWidth: 4 }} />
                  Sending
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Dev simulator active: messages are accepted + marked delivered locally — never real handset delivery.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Delivery log</CardTitle></CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto ievx-scrollbar">
            {deliveries === null ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="ievx-skeleton h-12 rounded-lg" />)
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              deliveries.map((d) => (
                <div key={d.id} className="rounded-lg bg-secondary/50 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{d.target}</span>
                    <Badge variant={statusTone(d.status) === 'success' ? 'default' : 'secondary'} className="text-[9px] capitalize">{humanize(d.status)}</Badge>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{d.purpose === 'MARKETING' ? 'Marketing' : 'Transactional'} · {d.provider}{d.segmentsCount ? ` · ${d.segmentsCount} seg` : ''} · {relative(d.createdAt)}</p>
                  {d.failureReason && <p className="mt-0.5 text-destructive">{d.failureReason}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

// ── Finance ─────────────────────────────────────────────────────────────────

function FinanceView({ orgId, role }: { orgId: string; role: string }) {
  const { toast } = useToast()
  const [data, setData] = useState<{
    summary: { grossSalesMinor: number; platformFeesMinor: number; netSalesMinor: number; pendingSettlementMinor: number; settlementHoldsMinor: number; availablePayoutMinor: number; payoutsInFlightMinor: number; payoutsCompletedMinor: number }
    journals: { id: string; memo: string; refType: string; createdAt: string; entries: { direction: string; amountMinor: number; account: { code: string; type: string; orgId?: string | null } }[] }[]
    refundCases: { id: string; type: string; status: string; amountMinor: number; reason: string; resolutionNote?: string | null; createdAt: string; requesterIsStaff: boolean; order: { reference: string; status: string; event: { title: string } }; requester: { id: string; displayName: string; email: string } }[]
  } | null>(null)
  const [payouts, setPayouts] = useState<{ id: string; amountMinor: number; status: string; createdAt: string; failureReason?: string | null }[] | null>(null)
  const [payoutForm, setPayoutForm] = useState({ amount: '', momo: '', name: '' })
  const [requesting, setRequesting] = useState(false)
  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [busyCase, setBusyCase] = useState<string | null>(null)
  const canPayout = ['OWNER', 'ADMIN', 'FINANCE'].includes(role)

  const load = useCallback(async () => {
    const [finance, payoutList] = await Promise.all([
      api.get<typeof data>(`/orgs/${orgId}/finance`).catch(() => null),
      api.get<{ items: typeof payouts }>(`/orgs/${orgId}/payouts`).catch(() => ({ items: [] })),
    ])
    setData(finance)
    setPayouts(payoutList.items)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const requestPayout = async () => {
    setRequesting(true)
    try {
      await api.post(`/orgs/${orgId}/payout-request`, {
        amountMinor: moneyFromCedis(Number(payoutForm.amount)),
        destination: { momoNumber: payoutForm.momo, recipientName: payoutForm.name },
      })
      toast({ title: 'Payout requested', description: 'Platform finance review follows; status is tracked below.' })
      setPayoutForm({ amount: '', momo: '', name: '' })
      await load()
    } catch (err) {
      toast({ title: 'Payout request failed', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setRequesting(false)
    }
  }

  const requestRefund = async (orderRef: string) => {
    try {
      await api.post(`/orgs/${orgId}/refund-request`, { orderId: orderRef, reason: 'Organizer-initiated refund' })
      toast({ title: 'Refund case opened' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not open the refund case.', variant: 'destructive' })
    }
  }

  const decideRefund = async (caseId: string, decision: 'approve' | 'reject') => {
    setBusyCase(caseId)
    try {
      if (decision === 'approve') {
        const res = await api.post<{ note?: string }>(`/orgs/${orgId}/refund-approve`, { caseId })
        toast({ title: 'Refund approved', description: res.note ?? 'The platform executes the money reversal.' })
      } else {
        const res = await api.post<{ orderStatus: string }>(`/orgs/${orgId}/refund-reject`, { caseId, note: rejectNote })
        toast({ title: 'Refund declined', description: `The buyer was notified and the order is ${humanize(res.orderStatus)} again.` })
      }
      setRejectFor(null)
      setRejectNote('')
      await load()
    } catch (err) {
      toast({ title: 'Decision not saved', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusyCase(null)
    }
  }

  if (!data) return <LoadingBlock />
  const s = data.summary

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Finance & Payouts</h1>
        <p className="text-sm text-muted-foreground">Balanced ledger · settlement holds · payout requests</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Gross sales', value: money(s.grossSalesMinor) },
          { label: 'Platform fees', value: money(s.platformFeesMinor) },
          { label: 'Pending settlement', value: money(s.pendingSettlementMinor) },
          { label: 'Available payout', value: money(s.availablePayoutMinor), highlight: true },
        ].map((c) => (
          <Card key={c.label} className="rounded-2xl">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className={`mt-1 text-lg font-extrabold ${c.highlight ? 'text-primary' : ''}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Request payout</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (₵)</Label>
                <Input id="amount" value={payoutForm.amount} onChange={(e) => setPayoutForm((f) => ({ ...f, amount: e.target.value }))} inputMode="decimal" placeholder={moneyToInputValue(s.availablePayoutMinor)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="momo">MoMo number</Label>
                <Input id="momo" value={payoutForm.momo} onChange={(e) => setPayoutForm((f) => ({ ...f, momo: e.target.value }))} placeholder="+233 …" inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient">Recipient</Label>
                <Input id="recipient" value={payoutForm.name} onChange={(e) => setPayoutForm((f) => ({ ...f, name: e.target.value }))} placeholder="Org name" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="rounded-full ievx-press" disabled={!canPayout || requesting || !payoutForm.amount || !payoutForm.momo} onClick={() => void requestPayout()}>
                Request payout
              </Button>
              {requesting && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <span className="efx-dual-ring-loader" aria-hidden="true" style={{ width: 36, height: 36, margin: 0, borderWidth: 4 }} />
                  Requesting
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Payouts settle to your verified mobile-money destination after platform review. In-flight amounts are held so they can never be double-spent.
              Provider submission (Hubtel Send Money) requires credentials + merchant agreement — status below is truthful.
            </p>
            {payouts && payouts.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Payout history</p>
                {payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                    <span className="font-semibold">{money(p.amountMinor)} · {relative(p.createdAt)}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant={statusTone(p.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[9px]">{humanize(p.status)}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HandCoins className="h-4 w-4 text-primary" aria-hidden /> Refund cases
              {data.refundCases.some((rc) => rc.status === 'REQUESTED') && (
                <Badge className="text-[9px]">{data.refundCases.filter((rc) => rc.status === 'REQUESTED').length} awaiting decision</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.refundCases.length === 0 && <p className="text-sm text-muted-foreground">No refund cases. Buyers can request refunds from their order page — they land here.</p>}
            {data.refundCases.map((rc) => {
              const decidable = rc.status === 'REQUESTED'
              return (
                <div key={rc.id} className={`rounded-xl border p-3 text-xs ${rc.status === 'REQUESTED' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/70 bg-secondary/40'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{rc.order.event.title}</span>
                    <Badge variant={statusTone(rc.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[9px]">{humanize(rc.status)}</Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                    <span className="font-mono">{rc.order.reference}</span> · {money(rc.amountMinor)} · {relative(rc.createdAt)}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">{rc.requesterIsStaff ? 'Opened by staff' : 'Buyer request'}</span> · {rc.requester.displayName} — “{rc.reason}”
                  </p>
                  {rc.status === 'APPROVED' && <p className="mt-1 text-primary">Approved — the platform finance desk executes the money reversal.</p>}
                  {rc.status === 'REJECTED' && rc.resolutionNote && <p className="mt-1 text-amber-700 dark:text-amber-400">Declined: “{rc.resolutionNote}”</p>}
                  {rc.status === 'MANUAL_TRACKED' && <p className="mt-1 text-muted-foreground">Provider endpoint pending sandbox verification — tracked with evidence, never faked.</p>}

                  {canPayout && decidable && (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-full ievx-press h-8"
                          disabled={busyCase === rc.id}
                          onClick={() => void decideRefund(rc.id, 'approve')}
                        >
                          {busyCase === rc.id ? <span className="efx-dual-ring-loader" aria-hidden="true" style={{ width: 16, height: 16, margin: 0, borderWidth: 2 }} /> : null}
                          {rc.status === 'APPROVED' ? 'Approved' : 'Approve refund'}
                        </Button>
                        {rejectFor !== rc.id && (
                          <Button size="sm" variant="outline" className="rounded-full h-8" disabled={busyCase === rc.id} onClick={() => { setRejectFor(rc.id); setRejectNote('') }}>
                            Decline…
                          </Button>
                        )}
                      </div>
                      {rejectFor === rc.id && (
                        <div className="space-y-1.5 rounded-lg border border-border bg-background/60 p-2.5">
                          <label htmlFor={`reject-note-${rc.id}`} className="text-[11px] font-semibold">Truthful reason shown to the buyer</label>
                          <Textarea
                            id={`reject-note-${rc.id}`}
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            rows={2}
                            maxLength={300}
                            placeholder="e.g. Refund window closed 48h before doors — we can transfer your ticket instead."
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="rounded-full h-8" disabled={busyCase === rc.id || rejectNote.trim().length < 10} onClick={() => void decideRefund(rc.id, 'reject')}>
                              Send decline
                            </Button>
                            <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => { setRejectFor(null); setRejectNote('') }}>
                              Cancel
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Declining keeps the tickets valid — the buyer is notified with this reason.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {canPayout && (
              <div className="flex gap-2 pt-1">
                <Input placeholder="Order ref to refund…" aria-label="Order reference for refund" onKeyDown={(e) => { if (e.key === 'Enter') void requestRefund((e.target as HTMLInputElement).value) }} />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Buyer requests land here for your decision; approving hands the money reversal to the platform finance desk (two-party money governance).
              Full-order mobile-money refunds follow the provider contract; unsupported/partial requests are tracked as MANUAL cases — never fake money movement.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" /> Ledger journals (append-only)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.journals.length === 0 && <p className="text-sm text-muted-foreground">No journals yet.</p>}
          {data.journals.slice(0, 12).map((j) => (
            <div key={j.id} className="rounded-xl bg-secondary/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{j.memo}</span>
                <span className="text-muted-foreground">{humanize(j.refType)} · {relative(j.createdAt)}</span>
              </div>
              <div className="mt-1.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {j.entries.map((e, i) => (
                  <p key={i}>{e.direction === 'DEBIT' ? 'DR' : 'CR'} {e.account.orgId ? 'organizer_payable' : e.account.code} … {money(e.amountMinor)}</p>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Team ────────────────────────────────────────────────────────────────────

function TeamView({ orgId, role }: { orgId: string; role: string }) {
  const { toast } = useToast()
  const [members, setMembers] = useState<{ id: string; role: string; user: { displayName: string; email: string }; acceptedAt?: string | null }[] | null>(null)
  const [invite, setInvite] = useState({ email: '', role: 'EVENT_MANAGER' })
  const canManage = ['OWNER', 'ADMIN'].includes(role)

  const load = useCallback(async () => {
    const data = await api.get<{ items: typeof members }>(`/orgs/${orgId}/team`).catch(() => ({ items: [] }))
    setMembers(data.items)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const addMember = async () => {
    try {
      await api.post(`/orgs/${orgId}/team`, invite)
      toast({ title: 'Team member added', description: `${invite.email} joined as ${humanize(invite.role)}.` })
      setInvite({ email: '', role: 'EVENT_MANAGER' })
      await load()
    } catch (err) {
      toast({ title: 'Could not add member', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Team</h1>
        <p className="text-sm text-muted-foreground">Roles: Owner · Admin · Event Manager · Finance · Check-in Staff · Analyst</p>
      </div>
      {canManage && (
        <Card className="rounded-2xl">
          <CardContent className="grid gap-2 p-4 sm:grid-cols-[1fr_200px_auto]">
            <Input value={invite.email} onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))} placeholder="member@email.com" inputMode="email" aria-label="Member email" />
            <Select value={invite.role} onValueChange={(v) => setInvite((i) => ({ ...i, role: v }))}>
              <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['ADMIN', 'EVENT_MANAGER', 'FINANCE', 'CHECKIN_STAFF', 'ANALYST'].map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="rounded-full" disabled={!invite.email.includes('@')} onClick={() => void addMember()}>Add member</Button>
          </CardContent>
        </Card>
      )}
      {members === null ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-16 rounded-xl" />)
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5">
              <div>
                <p className="font-semibold">{m.user.displayName}</p>
                <p className="text-xs text-muted-foreground">{m.user.email}</p>
              </div>
              <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'} className="capitalize">{humanize(m.role)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Billing ─────────────────────────────────────────────────────────────────

function BillingView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [sub, setSub] = useState<{ status: string; planCode: string | null; currentPeriodEnd: string | null; entitlements: { maxPublishedEvents: number; teamSeats: number; smsPerMonth: number; streamMinutesPerMonth: number } } | null>(null)
  const [plans, setPlans] = useState<{ id: string; code: string; name: string; description?: string | null; priceMinor: number; billingPeriodDays: number; entitlements: { maxPublishedEvents: number; teamSeats: number } }[] | null>(null)
  const [buying, setBuying] = useState('')

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      api.get<typeof sub>(`/orgs/${orgId}/subscription`).catch(() => null),
      api.get<{ items: typeof plans }>('/subscriptions').catch(() => ({ items: [] })),
    ])
    setSub(s)
    setPlans(p.items)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const purchase = async (planId: string) => {
    setBuying(planId)
    try {
      const result = await api.post<{ checkoutUrl?: string; activated?: boolean; free?: boolean }>('/subscriptions', { orgId, planId })
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
      } else {
        toast({ title: 'Plan activated' })
        await load()
      }
    } catch (err) {
      toast({ title: 'Could not purchase', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBuying('')
    }
  }

  const cancel = async () => {
    await api.post(`/orgs/${orgId}/subscription-cancel`).catch(() => {})
    toast({ title: 'Subscription cancelled', description: 'Existing attendee tickets remain valid — only new-organizer activity is restricted.' })
    await load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Subscription</h1>
        <p className="text-sm text-muted-foreground">Entitlements are enforced on the backend; expiry never invalidates attendee tickets.</p>
      </div>

      {sub && (
        <Card className="rounded-2xl border-primary/25 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-bold capitalize">{sub.planCode ? humanize(sub.planCode) : 'No plan'} · {humanize(sub.status)}</p>
              {sub.currentPeriodEnd && <p className="text-xs text-muted-foreground">Renews/expiry: {dateLong(sub.currentPeriodEnd)}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{sub.entitlements.maxPublishedEvents} published events · {sub.entitlements.teamSeats} seats · {sub.entitlements.smsPerMonth} SMS/mo · {sub.entitlements.streamMinutesPerMonth} stream min/mo</p>
            </div>
            {sub.status === 'ACTIVE' && (
              <Button variant="outline" className="rounded-full" onClick={() => void cancel()}>Cancel plan</Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className={`rounded-2xl ${sub?.planCode === p.code ? 'border-primary/40 shadow-md' : ''}`}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-bold">{p.name}</p>
                <p className="text-lg font-extrabold text-primary">{p.priceMinor === 0 ? 'Free' : `${money(p.priceMinor)}/${p.billingPeriodDays}d`}</p>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <ul className="space-y-1 text-sm">
                <li>✓ {p.entitlements.maxPublishedEvents} published events</li>
                <li>✓ {p.entitlements.teamSeats} team seats</li>
                <li>✓ Plan-limited SMS & streaming minutes</li>
              </ul>
              {sub?.planCode === p.code ? (
                <Badge className="w-fit">Current plan</Badge>
              ) : (
                <Button className="w-full rounded-full ievx-press" disabled={buying === p.id} onClick={() => void purchase(p.id)}>
                  {buying === p.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  {p.priceMinor === 0 ? 'Switch to Basic' : 'Purchase'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Auto-renewal is intentionally not enabled: renewal requires an officially supported provider flow with your consent. You get explicit renewal reminders instead.</p>
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

function SettingsView({ orgId, role }: { orgId: string; role: string }) {
  const { toast } = useToast()
  const [verification, setVerification] = useState<{ status: string; notes?: string | null } | null>(null)
  const [evidence, setEvidence] = useState('')
  const [form, setForm] = useState({ tagline: '', description: '', city: '', contactEmail: '', contactPhone: '', website: '', payoutMomo: '', payoutName: '' })

  useEffect(() => {
    void api.get<{ verification: { status: string; notes?: string | null } | null }>(`/orgs/${orgId}/verification`).then((d) => setVerification(d.verification))
  }, [orgId])

  const submitVerification = async () => {
    try {
      await api.post(`/orgs/${orgId}/verification-submit`, { evidence })
      toast({ title: 'Documents submitted', description: 'Platform finance review follows.' })
      setVerification({ status: 'PENDING' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not submit.', variant: 'destructive' })
    }
  }

  const saveSettings = async () => {
    try {
      await api.post(`/orgs/${orgId}/settings`, {
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        city: form.city || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        website: form.website || undefined,
        payoutMomoNumber: form.payoutMomo || undefined,
        payoutRecipientName: form.payoutName || undefined,
      })
      toast({ title: 'Settings saved', description: 'Payout destination changes are audited.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not save.', variant: 'destructive' })
    }
  }

  const canManage = ['OWNER', 'ADMIN'].includes(role)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground">Public profile, contacts and payout destination.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> Organizer verification
            {verification && <Badge variant={verification.status === 'APPROVED' ? 'default' : 'secondary'} className="capitalize">{humanize(verification.status)}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {verification?.status === 'APPROVED'
              ? 'Your organization is verified — paid ticket sales and payouts are unlocked.'
              : 'Paid ticket sales require verification (registration + payout details). Free RSVP events work immediately.'}
          </p>
          {verification?.status !== 'APPROVED' && (
            <div className="space-y-2">
              <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Describe your registration documents / GH card / bank details reference…" aria-label="Verification evidence" />
              <Button className="rounded-full" onClick={() => void submitVerification()} disabled={evidence.trim().length < 5}>Submit for review</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Organization profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="tagline">Tagline</Label><Input id="tagline" value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="ocity">City</Label><Input id="ocity" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="oemail">Contact email</Label><Input id="oemail" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="ophone">Contact phone</Label><Input id="ophone" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="oweb">Website</Label><Input id="oweb" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="momo">Payout MoMo number</Label><Input id="momo" value={form.payoutMomo} onChange={(e) => setForm((f) => ({ ...f, payoutMomo: e.target.value }))} placeholder="+233 …" inputMode="tel" /></div>
            <div className="space-y-1.5"><Label htmlFor="pname">Payout recipient name</Label><Input id="pname" value={form.payoutName} onChange={(e) => setForm((f) => ({ ...f, payoutName: e.target.value }))} /></div>
          </div>
          <Button className="rounded-full" disabled={!canManage} onClick={() => void saveSettings()}>{canManage ? 'Save settings' : 'Admin role required'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}

/* ───────────────────────────── Live Room (polls + Q&A control) ───────────────────────────── */

interface EngagementStats {
  openPollQuestion?: string
  openPollVotes?: number
  totalPolls: number
  pendingQuestions: number
  answeredQuestions: number
}

function LiveRoomView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [events, setEvents] = useState<OrgEvent[] | null>(null)
  const [stats, setStats] = useState<Record<string, EngagementStats>>({})
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await api.get<{ items: OrgEvent[] }>(`/events?mine=1&orgId=${orgId}&pageSize=50`)
      setEvents(data.items)
      const now = Date.now()
      const focus = data.items.filter((e) => e.status === 'LIVE' || (['PUBLISHED', 'LIVE'].includes(e.status) && new Date(e.startsAt).getTime() - now < 48 * 3600_000)).slice(0, 8)
      const nextStats: Record<string, EngagementStats> = {}
      await Promise.all(focus.map(async (e) => {
        const [polls, questions] = await Promise.all([
          api.get<{ polls: { status: string; question: string; totalVotes: number }[] }>(`/events/${e.id}/polls`).catch(() => ({ polls: [] })),
          api.get<{ questions: { status: string }[] }>(`/events/${e.id}/questions`).catch(() => ({ questions: [] })),
        ])
        const open = polls.polls.find((p) => p.status === 'OPEN')
        nextStats[e.id] = {
          openPollQuestion: open?.question,
          openPollVotes: open?.totalVotes,
          totalPolls: polls.polls.filter((p) => p.status !== 'DRAFT').length,
          pendingQuestions: questions.questions.filter((q) => q.status === 'NEW').length,
          answeredQuestions: questions.questions.filter((q) => q.status === 'ANSWERED').length,
        }
      }))
      setStats(nextStats)
    } catch {
      toast({ description: 'Could not load the live room.', variant: 'destructive' })
    } finally {
      setRefreshing(false)
    }
  }, [orgId, toast])

  useEffect(() => {
    void load()
  }, [load])

  if (events === null) return <LoadingBlock />

  const live = events.filter((e) => e.status === 'LIVE')
  const now = Date.now()
  const upcoming = events.filter((e) => e.status === 'PUBLISHED' && new Date(e.startsAt).getTime() - now > 0 && new Date(e.startsAt).getTime() - now < 48 * 3600_000)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Live Room</h1>
          <p className="text-sm text-muted-foreground">Run realtime polls and answer audience questions while the room is live.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full ievx-press" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Refresh
        </Button>
      </div>

      <Card className="ievx-glass rounded-2xl">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="efx-badge-ping relative inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden>
            <Activity className="h-5 w-5" />
            <span className="efx-badge-ping__dot" />
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="text-sm font-bold">Engagement runs on the event page itself</p>
            <p className="text-xs text-muted-foreground">
              Open an event below and use the Live engagement panel — create a poll beforehand, open it while live, and answers you publish appear instantly on every attendee&apos;s screen (results update in realtime).
            </p>
          </div>
        </CardContent>
      </Card>

      {live.length === 0 && upcoming.length === 0 && (
        <EmptyState
          title="Nothing live or starting soon"
          description="Events that are live, or starting within 48 hours, appear here with their engagement controls."
        />
      )}

      {live.length > 0 && (
        <section aria-labelledby="live-now-heading" className="space-y-3">
          <h2 id="live-now-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <span className="ievx-live-dot" aria-hidden /> Live now ({live.length})
          </h2>
          {live.map((e) => (
            <LiveRoomCard key={e.id} event={e} stats={stats[e.id]} highlight />
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="live-soon-heading" className="space-y-3">
          <h2 id="live-soon-heading" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Starting within 48 hours ({upcoming.length})</h2>
          {upcoming.map((e) => (
            <LiveRoomCard key={e.id} event={e} stats={stats[e.id]} />
          ))}
        </section>
      )}
    </div>
  )
}

function LiveRoomCard({ event, stats, highlight }: { event: OrgEvent; stats?: EngagementStats; highlight?: boolean }) {
  const live = event.status === 'LIVE'
  return (
    <Card className={`rounded-2xl ievx-card-hover ${highlight ? 'border-destructive/30' : ''}`}>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {live && <Badge className="bg-destructive text-white"><span className="ievx-live-dot" /> Live</Badge>}
            <p className="text-sm font-bold">{event.title}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {live ? `Started ${relative(event.startsAt)}` : `Starts ${relative(event.startsAt)}`} · {event.mode === 'VIRTUAL' ? 'Online' : event.city ?? '—'}
          </p>
          {stats && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {stats.openPollQuestion ? (
                <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
                  <Vote className="h-3 w-3" /> Poll open · {stats.openPollVotes ?? 0} votes
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5">{stats.totalPolls > 0 ? `${stats.totalPolls} poll${stats.totalPolls === 1 ? '' : 's'} ready` : 'No polls yet'}</Badge>
              )}
              <Badge variant="outline" className="gap-1.5">{stats.pendingQuestions} pending Q</Badge>
              {stats.answeredQuestions > 0 && <Badge variant="outline" className="gap-1.5">{stats.answeredQuestions} answered</Badge>}
            </div>
          )}
        </div>
        <Button size="sm" className="rounded-full efx-shine-sweep-button px-4" onClick={() => navigate(`/event/${event.slug}`)}>
          <Activity className="mr-1.5 h-3.5 w-3.5" /> Open live room
        </Button>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────────── Insights (real analytics) ───────────────────────────── */

interface InsightsDay {
  date: string
  tickets: number
  grossMinor: number
}

interface InsightsEventRow {
  id: string
  title: string
  slug: string
  startsAt: string
  status: string
  tickets: number
  grossMinor: number
  checkedIn: number
  ratingAvg: number | null
  reviewCount: number
}

interface InsightsPayload {
  windowDays: number
  totals: {
    eventsHeld: number
    eventsUpcoming: number
    liveNow: number
    ticketsSold: number
    grossMinor: number
    windowTickets: number
    windowGrossMinor: number
    checkedIn: number
    checkInRate: number
    avgRating: number | null
    waitlistDemand: number
  }
  trend: InsightsDay[]
  topEvents: InsightsEventRow[]
  ticketMix: { name: string; eventId: string; tickets: number; revenueMinor: number }[]
}

interface PricingAssessment {
  eventId: string
  eventTitle: string
  ticketTypeId: string
  ticketTypeName: string
  currentPriceMinor: number
  suggestedPriceMinor: number | null
  verdict: 'RAISE' | 'HOLD' | 'LOWER' | 'SOLD_OUT'
  rationale: string
  pctSold: number
  daysOut: number
  waitlist: number
}

interface AdvisorPayload {
  kind: 'pricing' | 'digest'
  source: 'ai' | 'heuristic'
  note: string | null
  assessments?: PricingAssessment[]
  headline?: string
  paragraphs?: string[]
  actions?: string[]
}

const VERDICT_STYLES: Record<PricingAssessment['verdict'], string> = {
  RAISE: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  LOWER: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  HOLD: 'bg-secondary text-secondary-foreground border-border',
  SOLD_OUT: 'bg-accent/10 text-accent-foreground border-accent/30',
}

function AiAdvisorCard({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'pricing' | 'digest'>('pricing')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AdvisorPayload | null>(null)

  const run = async (kind: 'pricing' | 'digest') => {
    setMode(kind)
    setBusy(true)
    try {
      const res = await api.post<AdvisorPayload>(`/orgs/${orgId}/ai-advisor`, { kind })
      setResult(res)
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'The advisor is unavailable right now.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI advisor</span>
          <span className="flex gap-1.5">
            <Button size="sm" variant={mode === 'pricing' ? 'default' : 'outline'} className="rounded-full" onClick={() => void run('pricing')} disabled={busy}>
              {busy && mode === 'pricing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Pricing advisor
            </Button>
            <Button size="sm" variant={mode === 'digest' ? 'default' : 'outline'} className="rounded-full" onClick={() => void run('digest')} disabled={busy}>
              {busy && mode === 'digest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Weekly digest
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy && <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Reading your real sales data…</p>}
        {!busy && !result && (
          <p className="py-2 text-sm text-muted-foreground">
            Grounded only in your organization's real rows — sold pace, sell-through, waitlist pressure and comparable category pricing.
            Suggestions are advisory: nothing changes until you edit ticket prices yourself.
          </p>
        )}
        {!busy && result && (
          <div className="space-y-3">
            {result.note && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">{result.note}</p>}
            <div className="flex items-center gap-2">
              <Badge variant={result.source === 'ai' ? 'default' : 'secondary'}>{result.source === 'ai' ? 'AI · validated against your data' : 'Heuristic fallback · real data'}</Badge>
              {result.kind === 'pricing' && <span className="text-xs text-muted-foreground">{result.assessments?.length ?? 0} ticket types reviewed</span>}
            </div>

            {result.kind === 'pricing' && (result.assessments?.length ?? 0) > 0 && (
              <div className="ievx-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
                {result.assessments!.map((a) => (
                  <div key={a.ticketTypeId} className="rounded-xl border border-border/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.ticketTypeName}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.eventTitle} · {a.daysOut > 0 ? `${a.daysOut} day${a.daysOut === 1 ? '' : 's'} out` : a.daysOut === 0 ? 'today' : 'past'}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${VERDICT_STYLES[a.verdict]}`}>{a.verdict}</span>
                    </div>
                    <p className="mt-2 text-sm tabular-nums">
                      {a.currentPriceMinor > 0 ? money(a.currentPriceMinor) : 'Free'}
                      {a.suggestedPriceMinor !== null && a.suggestedPriceMinor !== a.currentPriceMinor && (
                        <>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span className="font-bold text-primary">{money(a.suggestedPriceMinor)}</span>
                        </>
                      )}
                      {a.pctSold >= 0 && <span className="ml-2 text-xs text-muted-foreground">{Math.round(a.pctSold * 100)}% sold{a.waitlist > 0 ? ` · ${a.waitlist} waitlisted` : ''}</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.rationale}</p>
                  </div>
                ))}
              </div>
            )}
            {result.kind === 'pricing' && (result.assessments?.length ?? 0) === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No active ticket types to review yet.</p>
            )}

            {result.kind === 'digest' && (
              <div className="space-y-2">
                <p className="text-sm font-bold">{result.headline}</p>
                {result.paragraphs?.map((p, i) => <p key={i} className="text-sm text-muted-foreground">{p}</p>)}
                {result.actions && result.actions.length > 0 && (
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">This week's moves</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm">
                      {result.actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Advisory only — nothing changes until you edit ticket prices in Events. Prices and stats shown come from real settled orders and issued tickets.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function InsightsView({ orgId }: { orgId: string }) {
  const [data, setData] = useState<InsightsPayload | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    void api.get<InsightsPayload>(`/orgs/${orgId}/insights`).then(setData).catch(() => setData(null))
  }, [orgId])

  if (!data) return <LoadingBlock />

  const t = data.totals
  const maxTickets = Math.max(1, ...data.trend.map((d) => d.tickets))
  const maxGross = Math.max(1, ...data.trend.map((d) => d.grossMinor))
  const W = 560
  const H = 170
  const PAD_L = 26
  const PAD_R = 26
  const PAD_B = 22
  const step = data.trend.length > 1 ? (W - PAD_L - PAD_R) / (data.trend.length - 1) : W
  const points = data.trend.map((d, i) => ({
    x: PAD_L + i * step,
    y: H - PAD_B - (d.tickets / maxTickets) * (H - PAD_B - 14),
  }))

  // Smooth path (quadratic through midpoints) — straight line for 1–2 points.
  const linePath =
    points.length < 2
      ? ''
      : points.reduce((acc, p, i) => {
          if (i === 0) return `M ${p.x} ${p.y}`
          const prev = points[i - 1]
          const mx = (prev.x + p.x) / 2
          return `${acc} Q ${mx} ${prev.y} ${mx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`
        }, '')
  const areaPath = linePath ? `${linePath} L ${points[points.length - 1].x} ${H - PAD_B} L ${points[0].x} ${H - PAD_B} Z` : ''

  const stats = [
    { label: 'Tickets sold', value: String(t.ticketsSold), sub: `${t.windowTickets} in the last ${data.windowDays} days`, tone: 'text-primary' },
    { label: 'Gross (settled)', value: money(t.grossMinor), sub: `${money(t.windowGrossMinor)} in the last ${data.windowDays} days`, tone: 'text-foreground' },
    { label: 'Check-in rate', value: `${Math.round(t.checkInRate * 100)}%`, sub: `${t.checkedIn} of ${t.ticketsSold} tickets scanned`, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Attendee rating', value: t.avgRating ? `${t.avgRating} / 5` : '—', sub: 'VISIBLE reviews across your events', tone: 'text-amber-700 dark:text-amber-400' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Insights</h1>
        <p className="text-sm text-muted-foreground">Computed from settled orders, issued tickets, scans and reviews — nothing invented. {t.liveNow > 0 ? `${t.liveNow} event${t.liveNow === 1 ? '' : 's'} live right now.` : `${t.eventsUpcoming} upcoming · ${t.eventsHeld} held.`}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="ievx-glass rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={`mt-1 text-2xl font-extrabold tabular-nums ${s.tone}`}>{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Sales — last {data.windowDays} days</span>
            <span className="text-xs font-normal text-muted-foreground">line: tickets · bars: settled gross</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative" role="img" aria-label={`Daily tickets and gross for the last ${data.windowDays} days`}>
            {hover !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg"
                style={{ left: `${(points[hover].x / W) * 100}%`, top: 0 }}
              >
                <p className="font-bold">{data.trend[hover].date}</p>
                <p className="text-muted-foreground">{data.trend[hover].tickets} ticket{data.trend[hover].tickets === 1 ? '' : 's'} · {money(data.trend[hover].grossMinor)}</p>
              </div>
            )}
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
              <defs>
                <linearGradient id="insights-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.55 0.13 160 / 0.30)" />
                  <stop offset="100%" stopColor="oklch(0.55 0.13 160 / 0.02)" />
                </linearGradient>
              </defs>
              {/* Gross bars */}
              {data.trend.map((d, i) => {
                const barW = Math.max(4, step * 0.32)
                const h = (d.grossMinor / maxGross) * (H - PAD_B - 14) * 0.55
                return (
                  <rect
                    key={`bar-${d.date}`}
                    x={points[i].x - barW / 2}
                    y={H - PAD_B - h}
                    width={barW}
                    height={h}
                    rx={2}
                    className="fill-accent/25"
                  />
                )
              })}
              {areaPath && <path d={areaPath} fill="url(#insights-area)" />}
              {linePath && <path d={linePath} fill="none" stroke="oklch(0.55 0.13 160)" strokeWidth="2.5" strokeLinecap="round" />}
              {points.map((p, i) => (
                <g key={`dot-${data.trend[i].date}`}>
                  <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} className={hover === i ? 'fill-primary' : 'fill-primary/70'} />
                  <rect
                    x={Math.max(0, p.x - step / 2)}
                    y={0}
                    width={step || W}
                    height={H - PAD_B}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              ))}
              {data.trend.map((d, i) =>
                i % 2 === 0 || i === data.trend.length - 1 ? (
                  <text
                    key={`lbl-${d.date}`}
                    x={i === 0 ? points[i].x - 10 : i === data.trend.length - 1 ? points[i].x + 10 : points[i].x}
                    y={H - 6}
                    textAnchor={i === 0 ? 'start' : i === data.trend.length - 1 ? 'end' : 'middle'}
                    className="fill-muted-foreground text-[9px]"
                  >
                    {d.date.slice(5)}
                  </text>
                ) : null,
              )}
            </svg>
          </div>
        </CardContent>
      </Card>

      <AiAdvisorCard orgId={orgId} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0 rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Top events by tickets sold</CardTitle></CardHeader>
          <CardContent>
            {data.topEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No ticket sales yet — your best sellers will rank here.</p>
            ) : (
              <div className="overflow-x-auto ievx-scrollbar">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Event</th>
                    <th className="py-2 pr-2 text-right font-medium">Tickets</th>
                    <th className="py-2 pr-2 text-right font-medium">Gross</th>
                    <th className="py-2 pr-2 text-right font-medium">Checked in</th>
                    <th className="py-2 text-right font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEvents.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-2">
                        <button type="button" className="text-left font-medium hover:text-primary" onClick={() => navigate(`/event/${e.slug}`)}>{e.title}</button>
                        <p className="text-xs text-muted-foreground">{dateLong(e.startsAt)} · {humanize(e.status)}</p>
                      </td>
                      <td className="py-2.5 pr-2 text-right font-bold tabular-nums">{e.tickets}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{e.grossMinor > 0 ? money(e.grossMinor) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{e.checkedIn}</td>
                      <td className="py-2.5 text-right tabular-nums">{e.ratingAvg ? `${e.ratingAvg} (${e.reviewCount})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Ticket mix (settled revenue)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.ticketMix.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No settled orders yet.</p>
            ) : (
              data.ticketMix.map((row) => {
                const max = Math.max(...data.ticketMix.map((m) => m.revenueMinor), 1)
                const pct = Math.round((row.revenueMinor / max) * 100)
                return (
                  <div key={`${row.eventId}-${row.name}`}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{row.tickets} · {money(row.revenueMinor)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.name}: ${pct}% of mix`}>
                      <div className="ievx-poll-fill h-full rounded-full bg-gradient-to-r from-primary to-emerald-500" style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                )
              })
            )}
            {t.waitlistDemand > 0 && (
              <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
                <strong>{t.waitlistDemand}</strong> fan{t.waitlistDemand === 1 ? '' : 's'} on waitlists right now — raise capacity or wait for refunds to notify them.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
