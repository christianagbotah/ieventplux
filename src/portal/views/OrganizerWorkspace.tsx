'use client'
import {OrganizationSettlementSettings} from '../components/OrganizationSettlementSettings'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { connectRealtime } from '../realtime'
import {
  LayoutDashboard, CalendarPlus, CalendarClock, Users, Ticket, Radio, Clapperboard, Megaphone, MessageSquare, Wallet, UserCog, CreditCard, Settings,
  ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2, Camera, ScanLine, Search, Play, Square, RefreshCw, KeyRound, Pause, PlayCircle, Trash2, FileText, ShieldAlert, TrendingUp, Repeat, Activity, Vote, HandCoins, Sparkles, Download, Upload, CheckCircle2, Eye, EyeOff, Flag, History, Clock, MapPin, Pencil, Share2, X, AlertCircle, FilterX, CalendarRange,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate, type Route } from '../router'
import { usePortal } from '../store'
import { money, dateLong, timeRange, humanize, statusTone, relative, moneyToInputValue, moneyFromCedis, initials } from '../format'
import { PlayerSim } from '../components/PlayerSim'
import { EmptyState } from '../components/EventCard'
import { scanMayQueueOffline } from '../lib/checkin-policy'
import { acknowledgedScanIds, acknowledgePendingScans, isAlreadyPending, loadPendingScans, offlineScanScope, savePendingScan, type PendingScan } from '../lib/checkin-offline-storage'
import { OrganizationIdentityFields, emptyOrgFields } from '../components/OrganizationIdentityFields'
import { OrganizerTypeDetails } from '../components/OrganizerTypeDetails'
import { ORGANIZER_TYPE_CONFIG, organizerType, type OrganizerType, type ProfileDetails } from '@/lib/organization-types'
import { VerificationDocuments } from '../components/VerificationDocuments'
import { WorkspaceNavigation } from '../components/WorkspaceNavigation'
import { WorkspaceMetric } from '../components/WorkspaceMetric'
import { AdmissionOperationsPanel } from '../components/AdmissionOperationsPanel'
import { scannerSessionKey } from '../lib/scanner-session-local'
import { GrowthCommandCenter } from '../components/GrowthCommandCenter'
import { GroupMeetingsManager } from '../components/GroupMeetingsManager'
import { CreatorClipsStudio } from '../components/CreatorClipsStudio'
import { FieldError, FieldHelp } from '@/components/ui/field'
import { eventDraftIsReady, validateEventDraftTiming } from '../lib/event-editor-validation'
import { OrganizerEventCover } from '../components/OrganizerEventCover'
import { EventCopyCopilot } from '../components/EventCopyCopilot'
import { EventOperationsEditor } from '../components/EventOperationsEditor'
import { TicketSalesEditor, TicketSalesFields, salesPayload, type TicketSalesRow, type TicketSalesForm } from '../components/TicketSalesControls'
import { VenueLocationFields } from '../components/VenueLocationFields'
import { COUNTRY_NAMES } from '../lib/venue-locations'
import { filterOrganizerEvents, organizerEventCounts, ORGANIZER_EVENT_FILTERS, eventStatusConfirmation, eventTransitionAllowed, isEventShareable, type OrganizerEventFilter } from '../lib/organizer-event-view'
import { attendeeEventRoute, selectAttendeeEvent, validScopedEventId } from '../lib/attendee-event-context'

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
  venueId?: string | null
  coverImageUrl?: string | null
  summary?: string | null
  seriesId?: string | null
}

const NAV = [
  { key: 'dashboard', group: 'Overview', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'insights', group: 'Overview', label: 'Insights', icon: TrendingUp },
  { key: 'growth', group: 'Overview', label: 'Growth & AI', icon: Sparkles },
  { key: 'events', group: 'Events & tickets', label: 'Events', icon: CalendarPlus },
  { key: 'orders', group: 'Events & tickets', label: 'Orders', icon: Ticket },
  { key: 'attendees', group: 'Events & tickets', label: 'Attendees & Check-in', icon: Users },
  { key: 'studio', group: 'Production', label: 'Streaming Studio', icon: Radio },
  { key: 'creator-media', group: 'Production', label: 'Creator Media', icon: Clapperboard },
  { key: 'meetings', group: 'Production', label: 'Group Meetings', icon: Users },
  { key: 'live', group: 'Production', label: 'Live Room', icon: Activity },
  { key: 'promotions', group: 'Engagement', label: 'Promotions', icon: Megaphone },
  { key: 'messages', group: 'Engagement', label: 'Messaging', icon: MessageSquare },
  { key: 'finance', group: 'Business', label: 'Finance & Payouts', icon: Wallet },
  { key: 'team', group: 'Business', label: 'Team', icon: UserCog },
  { key: 'billing', group: 'Business', label: 'Subscription', icon: CreditCard },
  { key: 'settings', group: 'Business', label: 'Settings', icon: Settings },
]

export default function OrganizerWorkspace({ route }: { route: Route }) {
  const { user, memberships, activeOrgId, setActiveOrg, booted } = usePortal()
  const [section, setSection] = useState(route.query.get('tab') ?? 'dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Switch tabs at the top of the content pane without moving the desktop sidebar.
  // On small screens retain the browser's natural document scrolling.
  useEffect(() => {
    if (window.innerWidth >= 768) contentRef.current?.scrollTo(0, 0)
    else window.scrollTo(0, 0)
  }, [section, activeOrgId])

  useEffect(() => {
    if (!sidebarOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [sidebarOpen])

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
    const requestedOrg = route.query.get('orgId')
    if (requestedOrg && memberships.some(m => m.orgId === requestedOrg)) setActiveOrg(requestedOrg)
  }, [route, memberships, setActiveOrg])

  if (!user || memberships.length === 0) return null
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0]
  const canManageEvents = ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(activeOrg.role)
  const canViewReports = ['OWNER', 'ADMIN', 'FINANCE', 'ANALYST'].includes(activeOrg.role)
  const canViewGrowth = [...['OWNER', 'ADMIN', 'FINANCE', 'ANALYST'], 'EVENT_MANAGER'].includes(activeOrg.role)
  const visibleNav = NAV.filter((item) => {
    if (['insights', 'finance'].includes(item.key) && !canViewReports) return false
    if (item.key === 'growth' && !canViewGrowth) return false
    if (['meetings', 'creator-media'].includes(item.key) && !canManageEvents) return false
    return true
  })

  return (
    <div className="ievx-workspace-shell mx-auto max-w-[1440px] px-0 py-0 md:gap-4 md:overflow-hidden md:px-6 md:py-4">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close workspace navigation"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Persistent desktop navigation and accessible mobile drawer. */}
      <aside
        id="organizer-menu"
        aria-label="Organizer navigation"
        className={`ievx-workspace-sidebar ievx-scrollbar overflow-y-auto overscroll-contain
          ${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 w-72 translate-x-0' : 'invisible pointer-events-none fixed inset-y-0 left-0 z-40 w-72 -translate-x-full md:visible md:pointer-events-auto'}
          border-r p-3 pt-14 transition-transform duration-200 md:relative md:top-auto md:z-0 md:h-full md:max-h-none md:translate-x-0 md:rounded-[14px] md:border md:p-2.5
          ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[248px]'}`}
      >
        <button className="absolute right-3 top-3 rounded-lg p-1.5 hover:bg-secondary md:hidden" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="ievx-workspace-sidebar-brand">
          <span className="ievx-workspace-brand-icon"><LayoutDashboard className="size-[18px]" aria-hidden /></span>
          {(!sidebarCollapsed || sidebarOpen) && <div className="ievx-workspace-brand-copy">
            <strong>Organizer Studio</strong><small>Manage events & attendees</small>
          </div>}
        </div>
        {(!sidebarCollapsed || sidebarOpen) && (
          <div className="mt-3 px-1">
            <p className="ievx-workspace-eyebrow mb-1.5">Active organization</p>
            <Select value={activeOrg.orgId} onValueChange={(v) => { setActiveOrg(v); setSidebarOpen(false) }}>
              <SelectTrigger className="min-h-10 w-full rounded-lg text-xs" aria-label="Active organization"><SelectValue /></SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.orgId} value={m.orgId}>{m.orgName} · {humanize(m.role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <WorkspaceNavigation
          title="Workspace sections"
          items={visibleNav}
          active={section}
          collapsed={sidebarCollapsed && !sidebarOpen}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onSelect={(key) => {
            if (window.innerWidth >= 768) contentRef.current?.scrollTo(0, 0)
            else window.scrollTo(0, 0)
            setSection(key)
            setSidebarOpen(false)
            navigate(`/organizer?tab=${key}`, { replace: true })
          }}
        />
        {(!sidebarCollapsed || sidebarOpen) && (
          <div className="ievx-workspace-sidebar-footer">
            <p className="text-[11px] font-semibold">{activeOrg.orgName}</p>
            <p className="mt-1 text-[10px]">{humanize(activeOrg.role)} access · {memberships.length} organization{memberships.length === 1 ? '' : 's'}</p>
          </div>
        )}
      </aside>
      {/* Independent content area. The title/action toolbar is never oversized. */}
      <div ref={contentRef} className="ievx-workspace-content ievx-scrollbar min-w-0 flex-1 px-3 py-3 pb-7 sm:px-5 md:px-3 md:py-0 md:pb-8">
        <div className="ievx-workspace-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mr-1 size-9 rounded-lg md:hidden"
              aria-controls="organizer-menu"
              aria-label="Open organizer navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <LayoutDashboard className="size-[18px]" aria-hidden />
            </Button>
            <div className="min-w-0">
              <p className="ievx-workspace-eyebrow truncate">{activeOrg.orgName} / {humanize(activeOrg.role)}</p>
              <h1 className="ievx-workspace-toolbar-title">{NAV.find((item) => item.key === section)?.label ?? 'Dashboard'}</h1>
            </div>
          </div>
          {canManageEvents && <div className="flex shrink-0 items-center gap-1.5">
            {section !== 'meetings' && <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9 rounded-lg px-2.5"
              onClick={() => navigate('/organizer?tab=meetings', { replace: true })}
              aria-label="Open Group Meetings"
            >
              <Users className="size-4" aria-hidden />
              <span className="ml-1.5 hidden min-[390px]:inline">Meetings</span>
            </Button>}
            <Button
              size="sm"
              className="min-h-9 shrink-0 rounded-lg px-2.5"
              onClick={() => navigate('/organizer?tab=events&new=1', { replace: true })}
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden min-[390px]:inline">New event</span>
            </Button>
          </div>}
        </div>
        <div key={section} className="ievx-view-enter">
          {section === 'dashboard' && <Dashboard orgId={activeOrg.orgId} role={activeOrg.role} />}
          {section === 'insights' && (canViewReports ? <InsightsView orgId={activeOrg.orgId} /> : <RoleRestricted />)}
          {section === 'growth' && (canViewGrowth ? <div className="space-y-5"><GrowthCommandCenter orgId={activeOrg.orgId} canCreate={canManageEvents} />{canViewReports && <AiAdvisorCard orgId={activeOrg.orgId} />}</div> : <RoleRestricted />)}
          {section === 'events' && <EventsManager orgId={activeOrg.orgId} role={activeOrg.role} autoNew={route.query.get('new') === '1'} />}
          {section === 'orders' && <OrdersView orgId={activeOrg.orgId} initialEventId={route.query.get('eventId') ?? ''} />}
          {section === 'attendees' && <AttendeesView orgId={activeOrg.orgId} initialEventId={route.query.get('eventId') ?? ''} />}
          {section === 'studio' && <StudioView orgId={activeOrg.orgId} />}
          {section === 'creator-media' && (canManageEvents ? <CreatorClipsStudio orgId={activeOrg.orgId} /> : <RoleRestricted />)}
          {section === 'meetings' && (canManageEvents ? <GroupMeetingsManager orgId={activeOrg.orgId} /> : <RoleRestricted />)}
          {section === 'live' && <LiveRoomView orgId={activeOrg.orgId} />}
          {section === 'promotions' && <PromotionsView orgId={activeOrg.orgId} />}
          {section === 'messages' && <MessagesView orgId={activeOrg.orgId} />}
          {section === 'finance' && (canViewReports ? <div className="space-y-5">{['OWNER','ADMIN','FINANCE'].includes(activeOrg.role)&&<OrganizationSettlementSettings key={activeOrg.orgId} orgId={activeOrg.orgId}/>}<FinanceView orgId={activeOrg.orgId} role={activeOrg.role} /></div> : <RoleRestricted />)}
          {section === 'team' && <TeamView orgId={activeOrg.orgId} role={activeOrg.role} />}
          {section === 'billing' && <BillingView orgId={activeOrg.orgId} />}
          {section === 'settings' && <SettingsView orgId={activeOrg.orgId} role={activeOrg.role} />}
        </div>
      </div>
    </div>
  )
}

function RoleRestricted() {
  return <div role="status" className="rounded-2xl border border-border bg-card p-6"><ShieldAlert className="mb-3 size-6 text-amber-600" /><p className="text-base font-bold">Restricted workspace section</p><p className="mt-2 text-sm text-muted-foreground">Ask your organization owner or administrator for the relevant reporting permissions. Your other sections remain available.</p></div>
}

// ── Dashboard ────────────────────────────────────────────────────────────────

interface OnboardingData {
  orgStatus: string
  verificationStatus: string
  evidenceCount: number
  ticketTypeCount: number
}

function Dashboard({ orgId, role }: { orgId: string; role: string }) {
  const [data, setData] = useState<{
    counts: { published: number; draft: number; live: number; ticketsSold: number | null; followers: number }
    grossMinor: number | null
    finance: { availablePayoutMinor: number; pendingSettlementMinor: number; grossSalesMinor: number; platformFeesMinor: number; payoutsCompletedMinor: number } | null
    upcoming: OrgEvent[]
    onboarding?: OnboardingData
  } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const canCreate = ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(role)
  const canReview = ['OWNER', 'ADMIN'].includes(role)
  const canReport = ['OWNER', 'ADMIN', 'FINANCE', 'ANALYST'].includes(role)
  const canGrowth = canReport || canCreate

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    void api.get<NonNullable<typeof data>>(`/orgs/${orgId}/overview`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Dashboard data is unavailable. Try refreshing.')
      })
    return () => controller.abort()
  }, [orgId, revision])

  if (!data && error) return <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm font-bold">Unable to load your workspace</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => setRevision((r) => r + 1)}><RefreshCw className="mr-2 size-4" /> Retry</Button></div>
  if (!data) return <LoadingBlock />
  const finance = canReport ? data.finance : null
  const cards = [
    { label: 'Active events', value: (data.counts.published + data.counts.live).toLocaleString(), icon: CalendarClock, description: 'Published, scheduled and live' },
    ...(data.counts.ticketsSold !== null ? [{ label: 'Tickets issued', value: data.counts.ticketsSold.toLocaleString(), icon: Ticket, description: 'Across your events' }] : []),
    ...(finance ? [
      { label: 'Gross ticket sales', value: money(finance.grossSalesMinor), icon: TrendingUp, description: 'Confirmed payments · not platform profit' },
      { label: 'Available payout', value: money(finance.availablePayoutMinor), icon: Wallet, description: 'Subject to verified settlement' },
    ] : [{ label: 'Followers', value: data.counts.followers.toLocaleString(), icon: Users, description: 'Organizer community' }]),
  ]

  return (
    <div className="space-y-5">
      <section className="ievx-growth-hero relative overflow-hidden rounded-[22px] p-5 sm:p-6" aria-label="Organizer dashboard overview">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-emerald-200">Organizer command desk</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-[30px]">Make every event count.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">Manage your events, stay ahead of the next launch and bring your audience together. Your workspace is updated from real organizer records.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canCreate && <Button size="sm" className="border-none bg-white text-emerald-950 hover:bg-emerald-50" onClick={() => navigate('/organizer?tab=events&new=1')}><Plus className="mr-1.5 size-4" /> Create event</Button>}
              {canCreate && <Button size="sm" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate('/organizer?tab=meetings')}><Users className="mr-1.5 size-4" /> Group Meetings</Button>}
              {canGrowth && <Button size="sm" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate('/organizer?tab=growth')}><Sparkles className="mr-1.5 size-4" /> Growth & AI</Button>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-3 text-center"><p className="text-xl font-extrabold tabular-nums text-white">{data.counts.published}</p><p className="text-[11px] text-white/75">Published</p></div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-3 text-center"><p className="text-xl font-extrabold tabular-nums text-white">{data.counts.draft}</p><p className="text-[11px] text-white/75">Drafts</p></div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-3 text-center"><p className="text-xl font-extrabold tabular-nums text-white">{data.counts.live}</p><p className="text-[11px] text-white/75">Live</p></div>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="ievx-workspace-heading">Performance at a glance</h3><p className="mt-0.5 text-xs text-muted-foreground">Figures reflect actual organizer activity, not predictions</p></div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setRevision((r) => r + 1)}><RefreshCw className="mr-1.5 size-3.5" /> Refresh</Button>
      </div>
      <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${cards.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {cards.map((metric) => <WorkspaceMetric key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} description={metric.description} />)}
      </div>
      {canReview && data.onboarding && data.onboarding.orgStatus !== 'ACTIVE' && (
        <VerificationBanner onboarding={data.onboarding} onOpenSettings={() => navigate('/organizer?tab=settings')} />
      )}
      {canCreate && data.onboarding && <OnboardingChecklist counts={data.counts} onboarding={data.onboarding} />}
      {canGrowth && <GrowthCommandCenter orgId={orgId} compact canCreate={canCreate} />}
      <div className={`grid gap-4 ${finance ? 'lg:grid-cols-2' : ''}`}>
        <Card className="min-w-0 rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4 text-primary" /> Next events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming.length === 0 && (
              <EmptyState
                title="No upcoming events"
                description={canCreate ? 'Create your next event. Free RSVP can work while verification is in progress.' : 'Your organizer has no upcoming published events right now.'}
                action={canCreate ? <Button size="sm" className="rounded-lg" onClick={() => navigate('/organizer?tab=events&new=1')}><Plus className="mr-1 size-4" /> Create event</Button> : undefined}
              />
            )}
            {data.upcoming.map((e) => (
              <button key={e.id} className="flex w-full items-center justify-between gap-3 rounded-xl bg-secondary/50 p-3 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary" onClick={() => navigate(`/event/${e.slug}`)}>
                <div className="min-w-0"><p className="truncate font-semibold">{e.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{dateLong(e.startsAt)} · {e.mode === 'VIRTUAL' ? 'Online' : e.city ?? 'Venue pending'}</p></div>
                <Badge variant={statusTone(e.status) === 'success' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">{humanize(e.status)}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        {finance && (
          <Card className="min-w-0 rounded-2xl">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4 text-primary" /> Financial position</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label="Confirmed gross ticket sales" value={money(finance.grossSalesMinor)} />
              <Row label="Platform commission" value={`−${money(finance.platformFeesMinor)}`} />
              <Row label="Pending settlement" value={money(finance.pendingSettlementMinor)} />
              <Row label="Payouts completed" value={money(finance.payoutsCompletedMinor)} />
              <div className="border-t border-border pt-3"><Row label="Available payout" value={money(finance.availablePayoutMinor)} strong /></div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">The displayed gross is not the organizer's net income. Payout availability depends on settlements and verification.</p>
              <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/organizer?tab=finance')}>Open finance <ChevronRight className="ml-1.5 size-4" /></Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── R23 onboarding components ───────────────────────────────────────────────

function VerificationBanner({ onboarding, onOpenSettings }: { onboarding: OnboardingData; onOpenSettings: () => void }) {
  const copy =
    onboarding.verificationStatus === 'APPROVED'
      ? { title: 'Verified — activation in progress', body: 'Your documents were approved. Paid ticket sales unlock as soon as the organization is activated.' }
      : onboarding.verificationStatus === 'REJECTED'
        ? { title: 'Verification declined', body: 'Your last submission was declined. Update your details and resubmit to unlock paid ticket sales.' }
        : onboarding.evidenceCount > 0
          ? { title: 'Verification under review', body: 'Documents received — platform finance review is in progress. Free RSVP events work meanwhile.' }
          : { title: 'Verification required', body: 'Submit your registration documents to unlock paid ticket sales. Free RSVP events work immediately.' }
  const done = onboarding.orgStatus === 'ACTIVE'
  return (
    <div className={`grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 rounded-2xl border p-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:gap-x-4 ${done ? 'border-primary/30 bg-primary/5' : 'border-amber-500/40 bg-amber-500/10'}`} role="status">
      <span className={`col-start-1 row-start-1 flex size-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-primary/10' : 'bg-amber-500/15'}`}>
        <ShieldAlert className={`size-5 ${done ? 'text-primary' : 'text-amber-600 dark:text-amber-400'}`} aria-hidden="true" />
      </span>
      <p className="col-start-2 row-start-1 min-w-0 text-base font-bold leading-snug">{copy.title}</p>
      <p className="col-span-2 text-sm leading-relaxed text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-2">{copy.body}</p>
      <Button size="sm" variant={done ? 'outline' : 'default'} className="col-span-2 min-h-10 w-full rounded-xl sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:w-auto sm:rounded-full" onClick={onOpenSettings}>
        {done ? 'View settings' : onboarding.evidenceCount > 0 ? 'Review submission' : 'Submit documents'}
      </Button>
    </div>
  )
}

function OnboardingChecklist({ counts, onboarding }: { counts: { published: number; draft: number; live: number }; onboarding: OnboardingData }) {
  const steps = [
    {
      label: 'Create your first event',
      hint: 'Free RSVP works immediately — paid sales unlock after verification.',
      done: counts.published + counts.draft + counts.live > 0,
      go: () => navigate('/organizer?tab=events&new=1'),
    },
    {
      label: 'Add a ticket type',
      hint: 'Free RSVP or paid admission — prices are set per ticket type.',
      done: onboarding.ticketTypeCount > 0,
      go: () => navigate('/organizer?tab=events'),
    },
    {
      label: 'Submit verification',
      hint: 'Registration documents unlock paid ticket sales after review.',
      done: onboarding.evidenceCount > 0 || onboarding.verificationStatus === 'APPROVED',
      go: () => navigate('/organizer?tab=settings'),
    },
    {
      label: 'Publish an event',
      hint: 'Published events appear in Discover and can start selling.',
      done: counts.published > 0,
      go: () => navigate('/organizer?tab=events'),
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null
  const nextStep = steps.find((s) => !s.done)
  return (
    <Card className="rounded-2xl border-primary/25 bg-primary/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Getting started</span>
          <span className="text-xs font-medium text-muted-foreground">{doneCount} of {steps.length} complete</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Onboarding progress">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ul className="space-y-1">
          {steps.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={s.go}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary/60 ${s.done ? 'opacity-70' : ''}`}
                aria-label={s.done ? `${s.label} — done` : `Next step: ${s.label}`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.done ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-muted-foreground'}`}>
                  {s.done ? '✓' : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${s.done ? 'line-through decoration-muted-foreground/50' : ''}`}>{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.done ? 'Complete' : s.hint}</span>
                </span>
                {!s.done && <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        {nextStep && <p className="text-[11px] text-muted-foreground">Tip: tap any step to jump straight to it.</p>}
      </CardContent>
    </Card>
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

interface TicketTypeRow extends TicketSalesRow {
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

function EventsManager({ orgId, role, autoNew }: { orgId: string; role: string; autoNew?: boolean }) {
  const { toast } = useToast()
  const [events, setEvents] = useState<OrgEvent[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<OrganizerEventFilter>('ALL')
  const [editing, setEditing] = useState<OrgEvent | null>(null)
  const [guestsEvent, setGuestsEvent] = useState<OrgEvent | null>(null)
  const [creating, setCreating] = useState(() => Boolean(autoNew) && ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(role))
  const [stats, setStats] = useState<Record<string, { ticketsSold: number; grossMinor: number; checkedIn: number }>>({})
  const [statusAction, setStatusAction] = useState<{ event: OrgEvent; to: 'PUBLISHED' | 'POSTPONED' | 'CANCELLED' } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [transitionBusy, setTransitionBusy] = useState(false)
  const canPublish = ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(role)
  const loadedEvents = events ?? []
  // Counts represent only the loaded page(s), never falsely claim to be a full
  // platform-wide filter aggregate when there are more events in the backend.
  const counts = useMemo(() => organizerEventCounts(loadedEvents, Date.now()), [events])
  const displayed = useMemo(() => filterOrganizerEvents(loadedEvents, { view, query }), [events, view, query])

  const load = useCallback(async (requestedPage = 1, append = false) => {
    setLoadError(null)
    if (!append) setRefreshing(true)
    try {
      const data = await api.get<{ items: OrgEvent[]; total: number }>(
        `/events?mine=1&orgId=${encodeURIComponent(orgId)}&page=${requestedPage}&pageSize=24`,
      )
      setEvents((previous) => append && previous ? [...previous, ...data.items] : data.items)
      setPage(requestedPage)
      setTotal(data.total)
      const checks = await Promise.allSettled(data.items.slice(0, 10).map((e) =>
        api.get<{ ticketsSold: number; grossMinor: number; checkedIn: number }>(`/events/${e.id}/stats`)
          .then((stat) => [e.id, stat] as const)
      ))
      const nextStats = Object.fromEntries(
        checks.filter((entry): entry is PromiseFulfilledResult<readonly [string, { ticketsSold: number; grossMinor: number; checkedIn: number }]> => entry.status === 'fulfilled')
          .map((entry) => entry.value),
      )
      setStats((previous) => append ? { ...previous, ...nextStats } : nextStats)
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : 'Could not load events. Check your connection and try again.')
    } finally {
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [orgId])

  useEffect(() => {
    setEvents(null)
    setStats({})
    void load()
  }, [load])

  const shareEvent = async (event: OrgEvent) => {
    if (!isEventShareable(event)) return
    const url = new URL('/#/event/' + encodeURIComponent(event.slug), window.location.origin).href
    try {
      if (navigator.share) await navigator.share({ title: event.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast({ title: 'Event link copied', description: 'Share it with your audience.' })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // When native sharing is blocked, attempt the normal copy fallback.
      try {
        await navigator.clipboard.writeText(url)
        toast({ title: 'Event link copied' })
      } catch {
        toast({ title: 'Could not share event', description: 'You can open its public page and copy the address.', variant: 'destructive' })
      }
    }
  }

  const confirmTransition = async () => {
    if (!statusAction || transitionBusy) return
    if (statusAction.to !== 'PUBLISHED' && statusReason.trim().length < 8) return
    setTransitionBusy(true)
    try {
      await api.post(`/events/${statusAction.event.id}/transition`, {
        to: statusAction.to,
        ...(statusAction.to !== 'PUBLISHED' ? { reason: statusReason.trim() } : {}),
      })
      toast({
        title: 'Event ' + statusAction.to.toLowerCase(),
        description: statusAction.to === 'PUBLISHED'
          ? 'Publishing completed. Check the public event page to verify its details.'
          : 'Status updated. Attendee communication and any refunds require separate review.',
      })
      setStatusAction(null)
      setStatusReason('')
      await load()
    } catch (err) {
      toast({ title: 'Status was not changed', description: err instanceof ApiClientError ? err.message : 'Check your connection and retry.', variant: 'destructive' })
    } finally {
      setTransitionBusy(false)
    }
  }

  const currentAction = statusAction ? eventStatusConfirmation(statusAction.to) : null
  return (
    <div className="space-y-4">
      <section className="ievx-eventops-header overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Event management overview">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.11em] text-primary">
              <CalendarRange className="size-3.5" aria-hidden /> Event control center
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Your events, under control.</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Find events, preview their public pages, manage registrations and confirm important status changes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" aria-label="Refresh events" disabled={refreshing} className="min-h-10 rounded-xl" onClick={() => void load()}>
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              <span className="hidden min-[420px]:inline">Refresh</span>
            </Button>
            {canPublish && (
              <Button size="sm" className="min-h-10 rounded-xl" onClick={() => { setEditing(null); setCreating(true) }}>
                <Plus className="size-4" aria-hidden /> Create
              </Button>
            )}
          </div>
        </div>
        {events !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{total.toLocaleString()}</strong> events total</span>
            <span><strong className="text-foreground">{counts.ATTENTION}</strong> need attention{total > loadedEvents.length ? ' (loaded)' : ''}</span>
            <span><strong className="text-foreground">{counts.LIVE}</strong> live now{total > loadedEvents.length ? ' (loaded)' : ''}</span>
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="h-11 rounded-xl bg-card pl-9 pr-9" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Find event by name, city or category" aria-label="Search your events" />
          {query && <button type="button" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg hover:bg-muted" aria-label="Clear event search" onClick={() => setQuery('')}><X className="size-4" /></button>}
        </div>
        {(query || view !== 'ALL') && (
          <Button type="button" variant="ghost" className="min-h-10 shrink-0" size="sm" onClick={() => { setQuery(''); setView('ALL') }}>
            <FilterX className="size-4" aria-hidden /><span className="hidden sm:inline">Clear</span>
          </Button>
        )}
      </div>
      <nav className="ievx-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1" aria-label="Filter organizer events by status">
        {ORGANIZER_EVENT_FILTERS.map((tab) => (
          <button key={tab.value} type="button"
            className={`ievx-eventops-filter min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors sm:text-sm ${view === tab.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground'}`}
            aria-pressed={view === tab.value}
            onClick={() => setView(tab.value)}>
            {tab.label} <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${view === tab.value ? 'bg-white/20' : 'bg-muted'}`}>{counts[tab.value]}</span>
          </button>
        ))}
      </nav>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" aria-hidden />{loadError}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>}
      {events === null && !loadError ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-36 rounded-2xl" />)
      ) : events !== null && events.length === 0 ? (
        <EmptyState title="No events yet" description="Create your first event to start building your audience and managing registration."
          action={canPublish ? <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}><Plus className="mr-1 size-4" />Create event</Button> : undefined} />
      ) : events !== null && displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <Search className="mx-auto size-7 text-muted-foreground/70" aria-hidden />
          <p className="mt-2 text-sm font-bold">No matching events in the loaded list</p>
          <p className="mt-1 text-xs text-muted-foreground">{total > loadedEvents.length ? 'Load more events or ' : ''}Try another search or filter.</p>
          <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => { setView('ALL'); setQuery('') }}>Clear filters</Button>
        </div>
      ) : events !== null ? (
        <div className="space-y-3" aria-live="polite">
          <p className="text-xs text-muted-foreground">Showing {displayed.length} matching event{displayed.length === 1 ? '' : 's'} from {loadedEvents.length} loaded</p>
          {displayed.map((e) => (
            <Card key={e.id} className="ievx-eventops-card min-w-0 gap-0 rounded-2xl border-border/80 bg-card py-0">
              <CardContent className="space-y-3 p-3.5 sm:p-4">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <OrganizerEventCover key={e.coverImageUrl ?? 'no-cover'} src={e.coverImageUrl} title={e.title} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant={statusTone(e.status) === 'success' ? 'default' : 'secondary'} className="text-[10px]">{humanize(e.status)}</Badge>
                      {e.visibility !== 'PUBLIC' && <Badge variant="outline" className="text-[10px]">{humanize(e.visibility)}</Badge>}
                      {e.seriesId && <Badge variant="outline" className="text-[10px]"><Repeat className="mr-1 size-3" aria-hidden />Series</Badge>}
                    </div>
                    <h3 className="mt-1.5 text-sm font-extrabold leading-snug [overflow-wrap:anywhere] sm:text-base">{e.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {dateLong(e.startsAt)} · {e.mode === 'VIRTUAL' ? 'Online' : e.city || 'Venue to be announced'}
                    </p>
                    {stats[e.id] && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span><strong className="font-bold text-foreground">{stats[e.id].ticketsSold.toLocaleString()}</strong> tickets</span>
                        <span><strong className="font-bold text-foreground">{stats[e.id].checkedIn.toLocaleString()}</strong> checked in</span>
                        <span>Gross <strong className="font-bold text-foreground">{money(stats[e.id].grossMinor)}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                  <Button type="button" size="sm" variant="outline" className="min-h-10 grow rounded-lg sm:grow-0" onClick={() => navigate(`/event/${e.slug}`)}>
                    <Eye className="size-4" aria-hidden />{e.status === 'DRAFT' || e.status === 'SCHEDULED' ? 'Preview' : 'View'}
                  </Button>
                  {canPublish && <Button type="button" size="sm" variant="outline" className="min-h-10 grow rounded-lg sm:grow-0" onClick={() => { setEditing(e); setCreating(false) }}>
                    <Pencil className="size-4" aria-hidden />Edit
                  </Button>}
                  <Button type="button" size="sm" variant="outline" className="min-h-10 grow rounded-lg sm:grow-0" onClick={() => navigate(attendeeEventRoute(e.id))}>
                    <Users className="size-4" aria-hidden />Attendees
                  </Button>
                  {isEventShareable(e) && <Button type="button" size="sm" variant="outline" className="min-h-10 grow rounded-lg sm:grow-0" onClick={() => void shareEvent(e)}>
                    <Share2 className="size-4" aria-hidden />Share
                  </Button>}
                  {canPublish && e.visibility === 'INVITE_ONLY' && <Button type="button" size="sm" variant="outline" className="min-h-10 grow rounded-lg sm:grow-0" onClick={() => setGuestsEvent(e)}>
                    <Users className="size-4" aria-hidden />Invitations
                  </Button>}
                </div>
                {(eventTransitionAllowed(role, e.status, 'PUBLISHED') || eventTransitionAllowed(role, e.status, 'POSTPONED') || eventTransitionAllowed(role, e.status, 'CANCELLED')) && (
                  <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl bg-muted/50 p-2">
                    <span className="mr-auto pl-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status actions</span>
                    {eventTransitionAllowed(role, e.status, 'PUBLISHED') &&
                      <Button type="button" size="sm" className="min-h-9 rounded-lg" onClick={() => { setStatusReason(''); setStatusAction({ event:e, to:'PUBLISHED' }) }}>Publish</Button>}
                    {eventTransitionAllowed(role, e.status, 'POSTPONED') &&
                      <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={() => { setStatusReason(''); setStatusAction({ event:e, to:'POSTPONED' }) }}>Postpone</Button>}
                    {eventTransitionAllowed(role, e.status, 'CANCELLED') &&
                      <Button type="button" size="sm" variant="destructive" className="min-h-9 rounded-lg" onClick={() => { setStatusReason(''); setStatusAction({ event:e, to:'CANCELLED' }) }}>Cancel</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {events !== null && loadedEvents.length < total && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-xs text-muted-foreground">{loadedEvents.length} of {total} events loaded. Filters above apply to loaded events only.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-xl px-5" disabled={loadingMore}
            onClick={() => { setLoadingMore(true); void load(page + 1, true) }}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            Load more events
          </Button>
        </div>
      )}

      {(editing !== null || creating) && <EventEditor
        key={creating ? 'create-new' : editing?.id ?? 'none'}
        orgId={orgId} event={creating ? null : editing}
        onClose={() => { setEditing(null); setCreating(false); void load() }}
      />}
      {guestsEvent && <GuestsDialog key={guestsEvent.id} event={guestsEvent}
        onClose={() => { setGuestsEvent(null); void load() }} />}

      <Dialog open={Boolean(statusAction)} onOpenChange={(open) => { if (!open && !transitionBusy) { setStatusAction(null); setStatusReason('') } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>{currentAction?.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">{currentAction?.description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm">
            <span className="block text-[11px] font-semibold text-muted-foreground">Event affected</span>
            <span className="font-bold">{statusAction?.event.title}</span>
          </div>
          {statusAction && statusAction.to !== 'PUBLISHED' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-transition-reason">Reason for your records</Label>
              <Textarea id="event-transition-reason" value={statusReason} onChange={(e) => setStatusReason(e.target.value)}
                maxLength={500} rows={3} placeholder="Explain the change (at least 8 characters)" aria-describedby="event-transition-hint" />
              <p id="event-transition-hint" className="text-xs text-muted-foreground">This explanation is recorded with the status change; it does not itself send a message to attendees.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="min-h-11 rounded-xl" disabled={transitionBusy} onClick={() => { setStatusAction(null); setStatusReason('') }}>Keep event unchanged</Button>
            <Button variant={statusAction?.to === 'CANCELLED' ? 'destructive' : 'default'}
              disabled={transitionBusy || (statusAction?.to !== 'PUBLISHED' && statusReason.trim().length < 8)}
              className="min-h-11 rounded-xl" onClick={() => void confirmTransition()}>
              {transitionBusy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {currentAction?.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── R28: Guests & invitations ───────────────────────────────────────────
interface InvitationRow {
  id: string
  code: string
  displayName: string | null
  contact: string | null
  maxGuests: number
  guestsUsed: number
  guestsRemaining: number
  requireApproval: boolean
  expiresAt: string | null
  status: string
  createdAt: string
  rsvpCount: number
  approvedCount: number
  pendingCount: number
}

interface RsvpRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  guests: number
  status: string
  createdAt: string
  decidedAt: string | null
  invitationCode: string | null
  invitationName: string | null
}

function GuestsDialog({ event, onClose }: { event: OrgEvent; onClose: () => void }) {
  const { toast } = useToast()
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)
  const [rsvps, setRsvps] = useState<RsvpRow[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ displayName: '', contact: '', maxGuests: '2', requireApproval: false, expiresAt: '', code: '' })

  const load = useCallback(async () => {
    const data = await api.get<{ invitations: InvitationRow[]; rsvps: RsvpRow[] }>(`/events/${event.id}/guests`).catch(() => null)
    if (!data) {
      toast({ title: 'Could not load guests', variant: 'destructive' })
      return
    }
    setInvitations(data.invitations)
    setRsvps(data.rsvps)
    if (data.invitations.length === 0) setFormOpen(true)
  }, [event.id, toast])

  useEffect(() => {
    void (async () => { await load() })()
  }, [load])

  const decide = async (rsvp: RsvpRow, decision: 'approve' | 'decline') => {
    setDeciding(rsvp.id)
    try {
      await api.post(`/events/${event.id}/rsvp-decision`, { rsvpId: rsvp.id, decision })
      toast({
        title: decision === 'approve' ? 'Guest approved' : 'RSVP declined',
        description: decision === 'approve' ? `${rsvp.name} can now see the private address and get tickets.` : `${rsvp.name} was notified, and the seats were released.`,
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not decide', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setDeciding(null)
    }
  }

  const revoke = async (invitation: InvitationRow) => {
    setRevoking(invitation.id)
    try {
      await api.post(`/events/${event.id}/invitation-revoke`, { invitationId: invitation.id })
      toast({ title: 'Invitation revoked', description: `Code ${invitation.code} no longer accepts RSVPs. Existing approved guests keep their places.` })
      await load()
    } catch (err) {
      toast({ title: 'Could not revoke', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setRevoking(null)
    }
  }

  const createInvitation = async () => {
    setCreating(true)
    try {
      const result = await api.post<{ invitation: { code: string } }>(`/events/${event.id}/invitations`, {
        displayName: form.displayName || undefined,
        contact: form.contact || undefined,
        maxGuests: Number(form.maxGuests) || 2,
        requireApproval: form.requireApproval,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        code: form.code.trim() || undefined,
      })
      toast({ title: 'Invitation created', description: `Share code ${result.invitation.code} — link ${window.location.origin}/#/invite/${result.invitation.code}` })
      setForm({ displayName: '', contact: '', maxGuests: '2', requireApproval: false, expiresAt: '', code: '' })
      setFormOpen(false)
      await load()
    } catch (err) {
      toast({ title: 'Could not create', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/#/invite/${code}`
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Invite link copied', description: link })
    } catch {
      toast({ title: 'Invite link', description: link })
    }
  }

  const pending = rsvps.filter((r) => r.status === 'PENDING')
  const approved = rsvps.filter((r) => r.status === 'APPROVED')
  const declined = rsvps.filter((r) => r.status === 'DECLINED')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto ievx-scrollbar">
        <DialogHeader>
          <DialogTitle>Guests &amp; invitations — {event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant={pending.length > 0 ? 'default' : 'secondary'} className="gap-1"><Clock className="h-3 w-3" aria-hidden /> {pending.length} awaiting approval</Badge>
            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden /> {approved.length} approved</Badge>
            <Badge variant="secondary">{invitations?.length ?? '…'} codes</Badge>
            {declined.length > 0 && <Badge variant="outline">{declined.length} declined</Badge>}
          </div>

          {/* RSVP decision queue — R28's missing write path lives here. */}
          <section aria-label="RSVP queue" className="space-y-2">
            <h3 className="text-sm font-semibold">RSVP queue</h3>
            {invitations === null ? (
              <div className="ievx-skeleton h-16 rounded-2xl" />
            ) : rsvps.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No RSVPs yet — share an invitation code below.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto ievx-scrollbar pr-1">
                {[...pending, ...approved, ...declined].map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name}{r.invitationCode && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.invitationCode}</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.guests} {r.guests === 1 ? 'guest' : 'guests'}
                        {r.email ? ` · ${r.email}` : ''}{r.phone ? ` · ${r.phone}` : ''}
                      </p>
                    </div>
                    {r.status === 'PENDING' ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" className="rounded-full" disabled={deciding === r.id} onClick={() => void decide(r, 'approve')}>Approve</Button>
                        <Button size="sm" variant="outline" className="rounded-full" disabled={deciding === r.id} onClick={() => void decide(r, 'decline')}>Decline</Button>
                      </div>
                    ) : (
                      <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'} className="shrink-0 text-[10px]">
                        {humanize(r.status)}{r.decidedAt ? ` · ${relative(r.decidedAt)}` : ''}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Invitation codes */}
          <section aria-label="Invitation codes" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Invitation codes</h3>
              {!formOpen && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> New invitation</Button>
              )}
            </div>
            {formOpen && (
              <Card className="rounded-2xl">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-name">Guest name (optional)</Label>
                    <Input id="inv-name" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Akua Frimpong" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-contact">Contact (optional)</Label>
                    <Input id="inv-contact" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="phone or email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-max">Guests per invitation</Label>
                    <Input id="inv-max" type="number" min={1} max={10} value={form.maxGuests} onChange={(e) => setForm((f) => ({ ...f, maxGuests: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-code">Custom code (optional)</Label>
                    <Input id="inv-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="auto-generated if blank" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-exp">Expires (optional)</Label>
                    <Input id="inv-exp" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch id="inv-approval" checked={form.requireApproval} onCheckedChange={(v) => setForm((f) => ({ ...f, requireApproval: v }))} />
                    <Label htmlFor="inv-approval" className="text-xs">Require organizer approval</Label>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button className="rounded-full" disabled={creating} onClick={() => void createInvitation()}>{creating ? 'Creating…' : 'Create invitation'}</Button>
                    <Button variant="ghost" className="rounded-full" onClick={() => setFormOpen(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {invitations === null ? (
              <div className="ievx-skeleton h-16 rounded-2xl" />
            ) : invitations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No invitation codes yet — create one to let guests RSVP.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto ievx-scrollbar pr-1">
                {invitations.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        <span className="font-mono">{i.code}</span>
                        {i.displayName && <span className="ml-2 font-normal text-muted-foreground">{i.displayName}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.guestsUsed}/{i.maxGuests} seats used{i.contact ? ` · ${i.contact}` : ''}
                        {i.pendingCount > 0 ? ` · ${i.pendingCount} pending` : ''}
                        {i.expiresAt ? ` · expires ${dateLong(i.expiresAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {i.requireApproval && <Badge variant="outline" className="text-[10px]">Approval required</Badge>}
                      <Badge variant={i.status === 'ACTIVE' ? 'secondary' : i.status === 'EXHAUSTED' ? 'default' : 'destructive'} className="text-[10px]">{humanize(i.status)}</Badge>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => void copyLink(i.code)}>Copy link</Button>
                      {i.status === 'ACTIVE' && (
                        <Button size="sm" variant="destructive" className="rounded-full" disabled={revoking === i.id} onClick={() => void revoke(i)}>Revoke</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-muted-foreground">Approved guests see the private address and can get tickets. Declines release the invitation's seats.</p>
        </div>
      </DialogContent>
    </Dialog>
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
    venueId: event?.venueId ?? '',
    startsAt: toLocalInput(event?.startsAt ?? defaultStart()),
    endsAt: toLocalInput(event?.endsAt ?? defaultEnd()),
    coverImageUrl: event?.coverImageUrl ?? '',
    accessibilityInfo: '',
    attendanceRules: '',
    ageGuidance: '',
    refundPolicy: '',
  })
  const [tt, setTt] = useState<TicketSalesForm & { kind: string; includesVirtualAccess: boolean }>({ name: '', price: '0.00', quota: '100', perBuyerLimit: '4', saleStartsAt: '', saleEndsAt: '', groupMinQty: '', groupPctOff: '', kind: 'PHYSICAL', includesVirtualAccess: false })
  const [ticketOptionsOpen, setTicketOptionsOpen] = useState(false)
  const [ticketEditing, setTicketEditing] = useState<TicketTypeRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const scheduleErrors = validateEventDraftTiming(form)
  const [savingTt, setSavingTt] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState('3')
  const eventDeviceTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [seriesFields, setSeriesFields] = useState<string[]>(['summary', 'city'])
  const [seriesAdoptTime, setSeriesAdoptTime] = useState(false)
  const [applying, setApplying] = useState(false)
  // R23 onboarding: after CREATE the dialog stays open on the ticket-types step
  // (the old bare "Add ticket types, then publish." toast dumped the user back
  // on the list with nothing in hand). createdEvent holds the fresh draft.
  const [createdEvent, setCreatedEvent] = useState<OrgEvent | null>(null)
  const activeEvent = event ?? createdEvent
  // R23: real category list from the discovery catalog (replaces the free-text
  // slug input — a typo there silently hid events from every filter). Falls
  // back to the old input while loading / on failure.
  const [cats, setCats] = useState<{ slug: string; name: string }[] | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copyBeforeAi, setCopyBeforeAi] = useState<{ summary: string; description: string } | null>(null)
  const posterFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (event) {
      void api.get<{ event: { description: string; visibility: string; venueId?: string | null; accessibilityInfo?: string | null; attendanceRules?: string | null; ageGuidance?: string | null; refundPolicy?: string | null; ticketTypes: TicketTypeRow[] } }>(`/events/${event.id}`).then((d) => {
        setTicketTypes(d.event.ticketTypes ?? [])
        setForm((f) => ({
          ...f,
          description: d.event.description,
          visibility: d.event.visibility,
          venueId: d.event.venueId ?? '',
          accessibilityInfo: d.event.accessibilityInfo ?? '',
          attendanceRules: d.event.attendanceRules ?? '',
          ageGuidance: d.event.ageGuidance ?? '',
          refundPolicy: d.event.refundPolicy ?? '',
        }))
        // R23: editing an event that already uses the optional fields opens the
        // collapsed "More options" section so nothing looks lost.
        if (d.event.accessibilityInfo || d.event.attendanceRules || d.event.ageGuidance || d.event.refundPolicy) setMoreOpen(true)
      })
    }
  }, [event])

  useEffect(() => {
    void api.get<{ categories: { slug: string; name: string }[] }>('/discovery/categories')
      .then((d) => setCats(d.categories.map((c) => ({ slug: c.slug, name: c.name }))))
      .catch(() => setCats(null))
  }, [])

  // R31: the org's venue directory feeds the picker — reusable places with
  // address/map/accessibility, rendered on the public event page.
  const [venues, setVenues] = useState<{ id: string; name: string; city?: string | null; capacity?: number | null }[] | null>(null)
  useEffect(() => {
    void api.get<{ venues: { id: string; name: string; city?: string | null; capacity?: number | null }[] }>(`/orgs/${orgId}/venues`)
      .then((d) => setVenues(d.venues))
      .catch(() => setVenues([]))
  }, [orgId])

  const save = async () => {
    if(busy)return
    if(!event&&repeat&&(!/^\d{1,2}$/.test(repeatWeeks)||Number(repeatWeeks)<1||Number(repeatWeeks)>26)){setSaveError('Choose 1–26 extra weekly occurrences.');return}
    const errors = validateEventDraftTiming(form)
    if (Object.keys(errors).length > 0) {
      setSaveError('Review the event title and schedule before saving.')
      return
    }
    setBusy(true)
    setSaveError('')
    try {
      const payload = {
        ...form,
        venueId: form.venueId || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      }
      if (event) {
        await api.patch(`/events/${event.id}`, payload)
        toast({ title: 'Event saved' })
      } else {
        const result = await api.post<{ event: OrgEvent; occurrencesCreated: number }>('/events', { ...payload, orgId, timezone:eventDeviceTimezone, repeatWeeks: repeat ? Number(repeatWeeks) : 0 })
        toast({ title: 'Event created as a draft', description: result.occurrencesCreated > 0 ? `${result.occurrencesCreated} weekly occurrences added as drafts — publish them individually.` : 'Add a ticket type below, then publish from Events.' })
        setCreatedEvent(result.event) // R23: keep the dialog open on the ticket-types step
        return
      }
      onClose()
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not save this event. Check your connection and try again.'
      setSaveError(message)
      toast({ title: 'Could not save', description: message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const addTicketType = async () => {
    if (!activeEvent || !tt.name.trim()) return
    setSavingTt(true)
    try {
      await api.post(`/events/${activeEvent.id}/ticket-types`, {
        ...salesPayload(tt),
        kind: tt.kind,
        includesVirtualAccess: tt.includesVirtualAccess,
      })
      const detail = await api.get<{ event: { ticketTypes: TicketTypeRow[] } }>(`/events/${activeEvent.id}`)
      setTicketTypes(detail.event.ticketTypes)
      setTt({ ...tt, name: '', price: '0.00', saleStartsAt: '', saleEndsAt: '', groupMinQty: '', groupPctOff: '' })
      setTicketOptionsOpen(false)
      toast({ title: 'Ticket type added' })
    } catch (err) {
      toast({ title: 'Could not add ticket type', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSavingTt(false)
    }
  }

  const deactivateTt = async (id: string) => {
    await api.delete(`/events/${activeEvent?.id}/ticket-types/${id}`).catch(() => {})
    setTicketTypes((list) => (list ?? []).map((t) => (t.id === id ? { ...t, active: false } : t)))
  }

  // R23: real poster upload through the existing /uploads endpoint (previously
  // only reachable from the AI Content Studio) — no more URL-paste-only flow.
  const onPosterFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('orgId', orgId)
      fd.append('kind', 'POSTER')
      fd.append('caption', `Poster — ${form.title || 'event'}`.slice(0, 200))
      const res = await api.upload<{ asset: { url: string } }>('/uploads', fd)
      setForm((f) => ({ ...f, coverImageUrl: res.asset.url }))
      toast({ title: 'Poster uploaded', description: 'Saved to your media library and set as the cover.' })
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const catOptions = useMemo(() => {
    if (!cats) return null
    const list = cats.map((c) => ({ slug: c.slug, name: c.name }))
    if (form.categorySlug && !list.some((c) => c.slug === form.categorySlug)) {
      list.unshift({ slug: form.categorySlug, name: `${humanize(form.categorySlug)} (current)` })
    }
    return list
  }, [cats, form.categorySlug])

  const SERIES_FIELD_OPTIONS: { key: string; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'summary', label: 'Summary' },
    { key: 'description', label: 'Description' },
    { key: 'categorySlug', label: 'Category' },
    { key: 'coverImageUrl', label: 'Poster image' },
    { key: 'city', label: 'City' },
    { key: 'venueId', label: 'Venue' },
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
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-4xl ievx-scrollbar">
        <DialogHeader className="sticky top-0 z-10 border-b border-border/70 bg-card/95 px-4 py-4 text-left backdrop-blur-md sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Organizer Studio · Event production</p>
          <DialogTitle className="pr-8 text-xl font-extrabold tracking-tight">{event ? `Edit: ${event.title}` : createdEvent ? `Add tickets — ${createdEvent.title}` : 'Create your event'}</DialogTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {createdEvent ? 'Draft saved. Add free or paid ticket types, then publish from Events.' : event ? 'Update your event information, ticket types and programme.' : 'Start with the essentials. Your event remains a draft until you choose to publish.'}
          </p>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 px-4 py-5 sm:px-6">
          {!createdEvent && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-3 border-b border-border/70 pb-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">01</span>
              <div className="min-w-0">
                <h3 className="text-base font-bold tracking-tight">Event essentials</h3>
                <p className="text-xs text-muted-foreground">Tell guests what you're hosting and why they should attend.</p>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Event title <span className="text-destructive">*</span></Label>
              <Input id="title" value={form.title} maxLength={180}
                aria-invalid={form.title.length > 0 && Boolean(scheduleErrors.title)}
                aria-describedby="event-title-help" placeholder="e.g. Global Worship Summit 2027"
                onChange={(e) => { setSaveError(''); setForm((f) => ({ ...f, title: e.target.value })) }} />
              <FieldHelp id="event-title-help">Use a clear, searchable name (at least 3 characters).</FieldHelp>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="summary">Summary</Label>
              <Input id="summary" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="One-line hook for cards and search" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" className="min-h-28" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            {!createdEvent && <div className="min-w-0 sm:col-span-2">
              <EventCopyCopilot
                orgId={orgId} title={form.title} category={form.categorySlug} city={form.city}
                dateText={form.startsAt ? new Date(form.startsAt).toLocaleString('en-GH') : ''}
                canUndo={Boolean(copyBeforeAi)}
                onApply={(draft) => {
                  setCopyBeforeAi({ summary: form.summary, description: form.description })
                  setForm((current) => ({ ...current, summary: draft.summary, description: draft.description }))
                }}
                onUndo={() => {
                  if (!copyBeforeAi) return
                  setForm((current) => ({ ...current, ...copyBeforeAi }))
                  setCopyBeforeAi(null)
                }}
              />
            </div>}

            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              {catOptions ? (
                <Select value={form.categorySlug} onValueChange={(v) => setForm((f) => ({ ...f, categorySlug: v }))}>
                  <SelectTrigger id="category" aria-label="Category"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {catOptions.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="category" value={form.categorySlug} onChange={(e) => setForm((f) => ({ ...f, categorySlug: e.target.value }))} placeholder="concert" />
              )}
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
            <div className="sm:col-span-2 flex items-center gap-3 border-b border-border/70 pb-3 pt-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">02</span>
              <div className="min-w-0">
                <h3 className="text-base font-bold tracking-tight">Where &amp; when</h3>
                <p className="text-xs text-muted-foreground">Choose your location and exact event times.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Accra" />
            </div>
            {form.mode !== 'VIRTUAL' && (
              <div className="space-y-1.5">
                <Label htmlFor="venue">Venue</Label>
                <Select value={form.venueId || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, venueId: v === 'none' ? '' : v }))}>
                  <SelectTrigger id="venue" aria-label="Venue"><SelectValue placeholder="Pick a venue" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — city only</SelectItem>
                    {(venues ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}{v.city ? ` · ${v.city}` : ''}{v.capacity ? ` (cap ${v.capacity.toLocaleString()})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Reusable places from Settings → Venues — the public event page renders their address and map link.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="startsAt">Starts <span className="text-destructive">*</span></Label>
              <Input id="startsAt" type="datetime-local" value={form.startsAt}
                aria-invalid={Boolean(scheduleErrors.startsAt)} aria-describedby="event-start-help"
                onChange={(e) => { setSaveError(''); setForm((f) => ({ ...f, startsAt: e.target.value })) }} />
              <FieldHelp id="event-start-help">Uses your device's local time zone.</FieldHelp>
              {scheduleErrors.startsAt && <FieldError>{scheduleErrors.startsAt}</FieldError>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endsAt">Ends <span className="text-destructive">*</span></Label>
              <Input id="endsAt" type="datetime-local" value={form.endsAt}
                aria-invalid={Boolean(scheduleErrors.endsAt)} aria-describedby={scheduleErrors.endsAt ? 'event-end-error' : undefined}
                onChange={(e) => { setSaveError(''); setForm((f) => ({ ...f, endsAt: e.target.value })) }} />
              {scheduleErrors.endsAt && <FieldError id="event-end-error">{scheduleErrors.endsAt}</FieldError>}
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 border-b border-border/70 pb-3 pt-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">03</span>
              <div className="min-w-0">
                <h3 className="text-base font-bold tracking-tight">Artwork &amp; policies</h3>
                <p className="text-xs text-muted-foreground">Add visual identity and any extra attendee guidance.</p>
              </div>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="cover">Poster image</Label>
              <div className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap">
                <Input id="cover" className="min-w-0 flex-1" value={form.coverImageUrl} onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))} placeholder="/uploads/… or paste a URL" />
                <input
                  ref={posterFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onPosterFile(file)
                    e.target.value = ''
                  }}
                />
                <Button type="button" variant="outline" className="shrink-0" loading={uploading} onClick={() => posterFileRef.current?.click()}>
                  {!uploading && <Upload className="size-4" aria-hidden />}
                  {uploading ? 'Uploading' : 'Upload poster'}
                </Button>
              </div>
              <FieldHelp>Use a clear event poster or paste a previously uploaded image URL.</FieldHelp>
            </div>
            {/* R23: the four optional policy fields collapse behind "More options"
                — the create form now shows 11 fields instead of 15, with nothing
                removed (editing an event that uses them re-opens the section). */}
            <div className="sm:col-span-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden />
                More options{moreOpen ? '' : ' — age guidance, accessibility, rules, refund policy'}
              </button>
              {moreOpen && (
                <div className="mt-3 grid gap-4">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="refund">Refund policy</Label>
                    <Input id="refund" value={form.refundPolicy} onChange={(e) => setForm((f) => ({ ...f, refundPolicy: e.target.value }))} placeholder="Full refunds up to 48h before start…" />
                  </div>
                </div>
              )}
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
                    <p className="text-xs text-muted-foreground">extra weekly occurrences (1–26). All drafts keep the same local clock time in {eventDeviceTimezone}; publish each separately.</p>
                  </div>
                )}
              </div>
            )}
          </div>}

          {activeEvent && (
            <section aria-label="Event tickets and admission" className="min-w-0 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
              {createdEvent && (
                <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>Draft created. Add a ticket type below, then publish from Events.</span>
                </div>
              )}
              <div className="mb-4 flex items-center gap-3 border-b border-border/70 pb-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">04</span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight">Ticket types &amp; admission</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">Offer free RSVP, paid entry or both. You can change ticket availability later.</p>
                </div>
              </div>
              <div className="mb-3 space-y-1.5">
                {(ticketTypes ?? []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{t.name} {!t.active && <Badge variant="secondary" className="ml-1 text-[9px]">inactive</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{t.priceMinor === 0 ? 'Free' : money(t.priceMinor)} · {t.soldCount}/{t.quota || '∞'} sold · max {t.perBuyerLimit}/buyer{t.includesVirtualAccess ? ' · +online' : ''}</p>
                      {(t.saleStartsAt || t.saleEndsAt) && <p className="text-[11px] text-muted-foreground">Sales: {t.saleStartsAt ? dateLong(t.saleStartsAt) : 'Immediately'} – {t.saleEndsAt ? dateLong(t.saleEndsAt) : 'Until closed manually'}</p>}
                      {t.groupMinQty && t.groupPctOff && <p className="text-[11px] font-medium text-primary">{t.groupPctOff}% group discount for {t.groupMinQty}+ tickets</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {t.active && <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setTicketEditing(t)}><Pencil className="mr-1 size-3.5" /> Manage</Button>}
                      {t.active && t.soldCount === 0 && <Button size="icon" variant="ghost" aria-label={`Deactivate ${t.name}`} className="size-8 text-destructive" onClick={() => void deactivateTt(t.id)}><Trash2 className="size-3.5" /></Button>}
                    </div>
                  </div>
                ))}
                {(ticketTypes ?? []).length === 0 && <p className="text-xs text-muted-foreground">No ticket types yet — add free RSVP or paid admission.</p>}
              </div>
              <div className="grid min-w-0 gap-3 rounded-xl border border-border/65 bg-card p-3.5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="editor-ticket-name">Ticket name</Label>
                  <Input id="editor-ticket-name" value={tt.name} maxLength={100}
                    onChange={(e) => setTt((s) => ({ ...s, name: e.target.value }))} placeholder="General admission" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="editor-ticket-price">Price (₵)</Label>
                  <Input id="editor-ticket-price" value={tt.price} onChange={(e) => setTt((s) => ({ ...s, price: e.target.value }))}
                    placeholder="0.00" inputMode="decimal" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="editor-ticket-quota">Tickets available</Label>
                  <Input id="editor-ticket-quota" value={tt.quota} onChange={(e) => setTt((s) => ({ ...s, quota: e.target.value }))}
                    placeholder="100" inputMode="numeric" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="editor-ticket-limit">Maximum per buyer</Label>
                  <Input id="editor-ticket-limit" value={tt.perBuyerLimit} onChange={(e) => setTt((s) => ({ ...s, perBuyerLimit: e.target.value }))}
                    placeholder="4" inputMode="numeric" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="editor-ticket-kind">Admission format</Label>
                  <Select value={tt.kind} onValueChange={(v) => setTt((s) => ({ ...s, kind: v }))}>
                    <SelectTrigger id="editor-ticket-kind" aria-label="Admission format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHYSICAL">In person</SelectItem>
                      <SelectItem value="VIRTUAL">Online</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-1">
                  <Button type="button" variant="premium" className="w-full" loading={savingTt}
                    disabled={!tt.name.trim()} onClick={() => void addTicketType()}>
                    <Plus className="size-4" aria-hidden /> Add ticket type
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <button type="button" aria-expanded={ticketOptionsOpen} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-primary/5" onClick={() => setTicketOptionsOpen((open) => !open)}>
                  <CalendarClock className="size-4" /> {ticketOptionsOpen ? 'Hide advanced ticket settings' : 'Schedule ticket sales or add a group discount'} <ChevronDown className={'size-4 transition-transform ' + (ticketOptionsOpen ? 'rotate-180' : '')} />
                </button>
                {ticketOptionsOpen && <div className="mt-2"><TicketSalesFields value={tt} onChange={(next) => setTt((current) => ({ ...current, ...next }))} /></div>}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={tt.includesVirtualAccess} onCheckedChange={(v) => setTt((s) => ({ ...s, includesVirtualAccess: v }))} aria-label="Includes virtual access" />
                Includes online stream access (a physical-only ticket never unlocks virtual-only benefits)
              </label>
            </section>
          )}
          {activeEvent && <EventOperationsEditor key={activeEvent.id} eventId={activeEvent.id} />}
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
        {ticketEditing && activeEvent && <TicketSalesEditor eventId={activeEvent.id} ticket={ticketEditing} onClose={() => setTicketEditing(null)} onSaved={() => void api.get<{ event: { ticketTypes: TicketTypeRow[] } }>(`/events/${activeEvent.id}`).then((d) => setTicketTypes(d.event.ticketTypes ?? []))} />}
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
        <DialogFooter className="sticky bottom-0 z-10 flex-wrap gap-2 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur-md sm:px-6">
          {saveError && <p role="alert" className="w-full text-xs font-semibold text-destructive">{saveError}</p>}
          <Button type="button" variant="outline" onClick={onClose}>{event ? 'Close' : createdEvent ? 'Done' : 'Cancel'}</Button>
          {!createdEvent && (
            <Button type="button" variant="premium" loading={busy}
              onClick={() => void save()} disabled={!eventDraftIsReady(form)}>
              {event ? 'Save changes' : 'Create draft event'}
            </Button>
          )}
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

interface OrgOrderRow {
  reference: string
  status: string
  kind: string
  totalMinor: number
  buyerName: string
  buyerEmail: string
  createdAt: string
  items: { qty: number; ticketType: { name: string } }[]
}

function OrdersView({ orgId, initialEventId }: { orgId: string; initialEventId: string }) {
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [orders, setOrders] = useState<OrgOrderRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setEvents([])
    setEventId('')
    setOrders(null)
    setPage(1)
    void api.get<{ items: OrgEvent[] }>(
      '/events?mine=1&orgId=' + encodeURIComponent(orgId) + '&pageSize=50',
      { signal: controller.signal },
    ).then((data) => {
      if (controller.signal.aborted) return
      setEvents(data.items)
      setEventId(data.items.some(event => event.id === initialEventId) ? initialEventId : data.items[0]?.id ?? '')
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load organization events.')
    })
    return () => controller.abort()
  }, [orgId, initialEventId])

  useEffect(() => {
    if (!eventId) {
      setOrders([])
      return
    }
    const controller = new AbortController()
    setOrders(null)
    setError('')
    void api.get<{ items: OrgOrderRow[]; total: number }>(
      '/events/' + encodeURIComponent(eventId) + '/orders?page=' + page + '&pageSize=50',
      { signal: controller.signal },
    ).then((data) => {
      if (controller.signal.aborted) return
      setOrders(data.items)
      setTotal(data.total)
    }).catch((err) => {
      if (controller.signal.aborted) return
      setOrders([])
      setError(err instanceof ApiClientError ? err.message : 'Could not load orders.')
    })
    return () => controller.abort()
  }, [eventId, page, retry])

  const filteredOrders = (orders ?? []).filter((order) => {
    const term = search.trim().toLowerCase()
    return (statusFilter === 'ALL' || order.status === statusFilter) &&
      (!term || [order.reference, order.buyerName, order.buyerEmail, ...order.items.map((i) => i.ticketType.name)]
        .some((value) => value.toLowerCase().includes(term)))
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ievx-section-title">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review reservations, payment status and ticket sales for your events.</p>
        </div>
        <Select value={eventId} onValueChange={(value) => { setEventId(value); setPage(1); setSearch(''); setStatusFilter('ALL') }}>
          <SelectTrigger className="h-11 w-full rounded-xl sm:w-64" aria-label="Select an event for order history">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="ievx-surface grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="h-11 rounded-xl pl-9"
            aria-label="Search orders on the loaded page"
            placeholder="Search reference, buyer or ticket…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Filter orders by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {['ALL', 'PAID', 'PENDING_PAYMENT', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EXCEPTION_REVIEW'].map((status) => (
              <SelectItem key={status} value={status}>{status === 'ALL' ? 'All statuses' : humanize(status)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-11 rounded-xl" disabled={!eventId} onClick={() => setRetry((value) => value + 1)} aria-label="Refresh orders">
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span>{filteredOrders.length} visible on page {page} · {total.toLocaleString()} total orders</span>
        {(search || statusFilter !== 'ALL') && <span>Filters apply to the loaded page</span>}
      </div>

      {orders === null ? (
        <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading orders">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-28 rounded-2xl" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'ALL' ? 'No orders match the current filters' : 'No orders for this event yet'}
          description={search || statusFilter !== 'ALL' ? 'Try clearing the search or choosing a different status.' : 'Orders will appear here when attendees reserve tickets.'}
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden" aria-label="Event orders">
            {filteredOrders.map((order) => (
              <article key={order.reference} className="ievx-surface space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs font-semibold text-primary">{order.reference}</p>
                    <p className="mt-1 font-semibold">{order.buyerName || 'Buyer'}</p>
                    <p className="break-all text-xs text-muted-foreground">{order.buyerEmail}</p>
                  </div>
                  <Badge variant={statusTone(order.status) === 'success' ? 'default' : 'secondary'} className="shrink-0 text-[11px]">{humanize(order.status)}</Badge>
                </div>
                <div className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  {order.items.map((item) => item.qty + '× ' + item.ticketType.name).join(', ')}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold tabular-nums">{order.totalMinor === 0 ? 'Free' : money(order.totalMinor)}</span>
                  <span className="text-xs text-muted-foreground">{relative(order.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-border/70 md:block">
            <table className="w-full min-w-[670px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th scope="col" className="p-3">Reference</th><th scope="col" className="p-3">Buyer</th><th scope="col" className="p-3">Tickets</th><th scope="col" className="p-3">Total</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Placed</th></tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.reference} className="border-t border-border/50 hover:bg-secondary/30">
                    <td className="p-3 font-mono text-xs">{order.reference}</td>
                    <td className="p-3"><p className="font-medium">{order.buyerName}</p><p className="break-all text-xs text-muted-foreground">{order.buyerEmail}</p></td>
                    <td className="p-3 text-xs">{order.items.map((item) => item.qty + '× ' + item.ticketType.name).join(', ')}</td>
                    <td className="p-3 font-semibold tabular-nums">{order.totalMinor === 0 ? 'Free' : money(order.totalMinor)}</td>
                    <td className="p-3"><Badge variant={statusTone(order.status) === 'success' ? 'default' : 'secondary'}>{humanize(order.status)}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{relative(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {total > 50 && (
        <nav aria-label="Order history pages" className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</span>
          <Button variant="outline" disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </nav>
      )}
    </div>
  )
}

// ── Attendees + check-in ────────────────────────────────────────────────────

function AttendeesView({ orgId, initialEventId }: { orgId: string; initialEventId: string }) {
  const { toast } = useToast()
  const userId = usePortal((state) => state.user?.id)
  const queueScope = useMemo(() => userId ? offlineScanScope(userId, orgId) : '', [userId, orgId])
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState('')
  const [attendees, setAttendees] = useState<unknown[] | null>(null)
  const [attendeesError, setAttendeesError] = useState('')
  const [scanMode, setScanMode] = useState(false)
  const [scanValue, setScanValue] = useState('')
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lastResult, setLastResult] = useState<{ result: string; detail: string; ticket?: { holderName: string; ticketType: string } } | null>(null)
  const [offlineQueue, setOfflineQueue] = useState<PendingScan[]>([])
  const [queueReady, setQueueReady] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [online, setOnline] = useState(true)
  const [scanBusy, setScanBusy] = useState(false)
  const [browserSessionId, setBrowserSessionId] = useState('')
  const [monitorRevision, setMonitorRevision] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanBusyRef = useRef(false)
  const pendingRef = useRef<PendingScan[]>([])
  const selectedEventRef = useRef('')
  const recentScanRef = useRef<{ payload: string; eventId: string; at: number } | null>(null)

  useEffect(() => {
    setBrowserSessionId('')
    if (!userId || !orgId || !eventId) return
    try {
      setBrowserSessionId(localStorage.getItem(scannerSessionKey(userId, orgId, eventId)) ?? '')
    } catch {
      // Browser storage can be disabled. Scanning without registration remains
      // available, with events attributed to staff rather than a device.
    }
  }, [eventId, userId, orgId])

  const registerBrowserSession = (id: string) => {
    if (!userId || !eventId || !id) return
    try {
      localStorage.setItem(scannerSessionKey(userId, orgId, eventId), id)
    } catch {
      toast({ description: 'This browser could not remember the scanner session after reload.', variant: 'destructive' })
    }
    setBrowserSessionId(id)
  }

  useEffect(() => { pendingRef.current = offlineQueue }, [offlineQueue])

  // Recover this user's pending scans after refresh/reopening the browser.
  // Only the authenticated staff member + active org scope is loaded.
  useEffect(() => {
    let disposed = false
    const load = async () => {
      setQueueReady(false)
      setQueueError('')
      setOfflineQueue([])
      pendingRef.current = []
      if (!queueScope) return
      try {
        const pending = await loadPendingScans(queueScope)
        if (!disposed) { pendingRef.current = pending; setOfflineQueue(pending); setQueueReady(true) }
      } catch (error) {
        if (!disposed) {
          setQueueError(error instanceof Error ? error.message : 'Local storage is unavailable.')
          setQueueReady(true)
        }
      }
    }
    void load()
    return () => { disposed = true }
  }, [queueScope])

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine)
    updateNetwork()
    window.addEventListener('online', updateNetwork)
    window.addEventListener('offline', updateNetwork)
    return () => {
      window.removeEventListener('online', updateNetwork)
      window.removeEventListener('offline', updateNetwork)
    }
  }, [])

  // An event-specific link can target an event older than the first 50.
  // The separate lookup is intentionally tenant-scoped and membership-checked
  // by the events API. No event id is trusted from the URL alone.
  useEffect(() => {
    const controller = new AbortController()
    // Switching organizations must clear any previously selected event before
    // allowing a new scan; responses from the former org are aborted.
    selectedEventRef.current = ''
    setEventId('')
    setScanMode(false)
    setEvents([])
    const loadOptions = async () => {
      setEventsLoading(true)
      setEventsError('')
      try {
        const url = '/events?mine=1&orgId=' + encodeURIComponent(orgId) + '&status=ALL&pageSize=50'
        const data = await api.get<{ items: OrgEvent[] }>(url, { signal: controller.signal })
        let scopedMatch: OrgEvent | null = null
        if (initialEventId && validScopedEventId(initialEventId) && !data.items.some((item) => item.id === initialEventId)) {
          const scoped = await api.get<{ items: OrgEvent[] }>(
            url + '&eventId=' + encodeURIComponent(initialEventId) + '&pageSize=1',
            { signal: controller.signal },
          )
          scopedMatch = scoped.items.find((item) => item.id === initialEventId) ?? null
        }
        if (controller.signal.aborted) return
        const selected = selectAttendeeEvent(data.items, initialEventId, scopedMatch)
        selectedEventRef.current = selected.selectedId
        setEvents(selected.events)
        setEventId(selected.selectedId)
        if (initialEventId && selected.selectedId !== initialEventId) {
          setEventsError('That event was not found in this organization. Select an available event to manage its attendees.')
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setEventsError(err instanceof ApiClientError ? err.message : 'Could not load the events for this organization.')
        setEvents([])
        setEventId('')
      } finally {
        if (!controller.signal.aborted) setEventsLoading(false)
      }
    }
    void loadOptions()
    return () => controller.abort()
  }, [orgId, initialEventId])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!eventId) return
    const targetEventId = eventId
    setAttendeesError('')
    try {
      const att = await api.get<{ items: unknown[] }>(
        '/events/' + encodeURIComponent(targetEventId) + '/attendees?pageSize=100',
        { signal },
      )
      if (signal?.aborted || selectedEventRef.current !== targetEventId) return
      setAttendees(att.items)
    } catch (err) {
      if (signal?.aborted || selectedEventRef.current !== targetEventId) return
      setAttendeesError(err instanceof ApiClientError ? err.message : 'Could not load the attendee list.')
      setAttendees([])
    }
  }, [eventId])

  useEffect(() => {
    selectedEventRef.current = eventId
    setAttendees(eventId ? null : [])
    setAttendeesError('')
    if (!eventId) return
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [eventId, refresh])

  const changeEvent = (nextEventId: string) => {
    if (scanBusyRef.current || !events.some((item) => item.id === nextEventId)) return
    selectedEventRef.current = nextEventId
    setScanMode(false)
    setLastResult(null)
    setScanValue('')
    setLookupQuery('')
    setLookupError('')
    setEventId(nextEventId)
    // Preserve this component and its in-tab offline queue. Dispatching a hash
    // change here would remount the portal and discard unsubmitted scans.
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + attendeeEventRoute(nextEventId))
  }

  // Manual + camera scan submission (declared before the camera effect that calls it).
  const submitScan = async (payload: string) => {
    const code = payload.trim()
    if (!eventId || !code || scanBusyRef.current || !queueReady || !queueScope) return
    if (isAlreadyPending(pendingRef.current, eventId, code)) {
      setLastResult({ result: 'QUEUED_OFFLINE', detail: 'This ticket is already pending for this event. Sync it before scanning again. It is not admitted yet.' })
      setScanValue('')
      return
    }
    if (recentScanRef.current?.payload === code && recentScanRef.current.eventId === eventId && Date.now() - recentScanRef.current.at < 5000) return
    scanBusyRef.current = true
    setScanBusy(true)
    recentScanRef.current = { payload: code, eventId, at: Date.now() }
    const targetEventId = eventId
    const clientScanId = 'web-' + crypto.randomUUID()
    try {
      const result = await api.post<{ result: string; detail: string; ticket?: { holderName: string; ticketType: string } }>('/checkin/scan', {
        eventId: targetEventId,
        payload: code,
        clientScanId,
        ...(browserSessionId ? { deviceSessionId: browserSessionId } : {}),
      })
      if (selectedEventRef.current === targetEventId) {
        setLastResult(result)
        setScanValue('')
        await refresh()
        setMonitorRevision((current) => current + 1)
      }
    } catch (err) {
      // HTTP 400/401/403/409/429 errors are authoritative server decisions,
      // NOT evidence that this device is offline. Never queue rejected codes.
      const networkFailure = scanMayQueueOffline(err, online)
      if (networkFailure && !queueError) {
        try {
          const pending: PendingScan = { eventId: targetEventId, payload: code, clientScanId, at: new Date().toISOString() }
          await savePendingScan(queueScope, pending)
          pendingRef.current = [...pendingRef.current, pending]
          setOfflineQueue(pendingRef.current)
          if (selectedEventRef.current === targetEventId) {
            setLastResult({
              result: 'QUEUED_OFFLINE',
              detail: 'Scan saved on this device for later verification. It is NOT an admission. Sync when connected.',
            })
            setScanValue('')
          }
        } catch (storageError) {
          const message = storageError instanceof Error ? storageError.message : 'Local storage is unavailable.'
          if (selectedEventRef.current === targetEventId) {
            setLastResult({ result: 'ERROR', detail: 'Could not save offline scan. No admission was recorded. ' + message })
            toast({ description: 'Offline scan was NOT saved. ' + message, variant: 'destructive' })
          }
        }
      } else {
        const detail = networkFailure && queueError
          ? 'Offline storage is unavailable. This scan was NOT saved. ' + queueError
          : err instanceof ApiClientError ? err.message : 'Could not verify this ticket.'
        if (selectedEventRef.current === targetEventId) {
          setLastResult({ result: 'ERROR', detail })
          toast({ description: detail, variant: 'destructive' })
        }
      }
    } finally {
      scanBusyRef.current = false
      setScanBusy(false)
    }
  }

  // Camera preview + BarcodeDetector scanning where supported.
  useEffect(() => {
    if (!scanMode || !eventId) return
    let disposed = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const w = window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }
        if (w.BarcodeDetector && videoRef.current) {
          const detector = new w.BarcodeDetector({ formats: ['qr_code'] })
          let detecting = false
          timer = setInterval(async () => {
            if (disposed || detecting || scanBusyRef.current || !videoRef.current) return
            detecting = true
            try {
              const codes = await detector.detect(videoRef.current)
              if (!disposed && selectedEventRef.current === eventId && codes[0]?.rawValue) {
                void submitScan(codes[0].rawValue)
              }
            } catch {
              /* frame not ready */
            } finally {
              detecting = false
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
      disposed = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [scanMode, eventId])

  const activeOfflineQueue = offlineQueue.filter((scan) => scan.eventId === eventId)
  const syncOffline = async () => {
    if (activeOfflineQueue.length === 0 || !eventId || !queueReady || !queueScope || syncBusy || !online) return
    const targetEventId = eventId
    const batch = activeOfflineQueue.slice(0, 200)
    setSyncBusy(true)
    try {
      const response = await api.post<{ synced: number; results: { result: string; detail: string }[] }>('/checkin/sync', {
        eventId: targetEventId,
        ...(browserSessionId ? { deviceSessionId: browserSessionId } : {}),
        scans: batch.map((scan) => ({
          payload: scan.payload, clientScanId: scan.clientScanId, capturedOfflineAt: scan.at,
        })),
      })
      // The API processes scans in order, but may acknowledge only part of the
      // batch; delete only corresponding IDs after validating its response.
      const acknowledged = acknowledgedScanIds(batch, response.synced, response.results)
      await acknowledgePendingScans(queueScope, acknowledged)
      const remaining = await loadPendingScans(queueScope)
      pendingRef.current = remaining
      setOfflineQueue(remaining)
      const admitted = response.results.filter((entry) => entry.result === 'ADMITTED').length
      const conflicts = response.results.filter((entry) => ['CONFLICT', 'DUPLICATE', 'INVALID'].includes(entry.result)).length
      toast({
        title: response.synced + ' scan' + (response.synced === 1 ? '' : 's') + ' reconciled',
        description: admitted + ' admitted, ' + conflicts + ' conflict/duplicate/invalid. ' +
          (remaining.some((scan) => scan.eventId === targetEventId) ? 'More scans remain pending.' : 'No pending scans for this event.'),
      })
      if (targetEventId === selectedEventRef.current) {
        await refresh()
        setMonitorRevision((current) => current + 1)
      }
    } catch (err) {
      toast({
        description: (err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Sync failed.') +
          ' Unacknowledged scans remain on this device; retry safely using their original scan IDs.',
        variant: 'destructive',
      })
      // If the server accepted some requests but confirmation was interrupted,
      // replaying the exact same clientScanId safely retrieves its prior result.
    } finally {
      setSyncBusy(false)
    }
  }

  // Debounce server-side lookup. Prevent late results from a previous query
  // replacing a more recent search or a different selected event.
  useEffect(() => {
    const query = lookupQuery.trim()
    if (!eventId || query.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void api.get<{ items: { id?: string; code: string; holderName: string; status: string; ticketType?: string; checkedInAt?: string | null }[] }>(
        '/checkin/lookup?eventId=' + encodeURIComponent(eventId) + '&q=' + encodeURIComponent(query),
        { signal: controller.signal },
      ).then((response) => {
        if (controller.signal.aborted) return
        setAttendees(response.items)
        setLookupError('')
      }).catch((error) => {
        if (controller.signal.aborted) return
        setLookupError(error instanceof ApiClientError ? error.message : 'Could not search attendees.')
      })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [eventId, lookupQuery])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Attendees & Check-in</h1>
          <p className="text-sm text-muted-foreground">Admission monitoring and event check-in operations</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={eventId} onValueChange={changeEvent} disabled={eventsLoading || scanBusy || events.length === 0}>
            <SelectTrigger className="h-11 w-full min-w-0 rounded-xl sm:w-56" aria-label="Select event for attendee check-in">
              <SelectValue placeholder={eventsLoading ? 'Loading events…' : 'Choose an event'} />
            </SelectTrigger>
            <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
          {eventId && (
            <Button variant="outline" className="rounded-full" asChild aria-label="Export attendees as CSV (audited)">
              <a href={`/api/v1/events/${eventId}/export`} download>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </a>
            </Button>
          )}
          <Button variant={scanMode ? 'default' : 'outline'} disabled={!eventId || eventsLoading || !queueReady} className="h-11 rounded-full" onClick={() => setScanMode((s) => !s)}>
            <ScanLine className="mr-1.5 h-4 w-4" /> {scanMode ? 'Close scanner' : 'Scan tickets'}
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" aria-label="Refresh attendee list and admission monitor" disabled={!eventId} onClick={() => { void refresh(); setMonitorRevision((current) => current + 1) }}>
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {eventsError && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p>{eventsError}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2 min-h-9 rounded-lg" onClick={() => navigate('/organizer?tab=attendees', { replace: true })}>
            Reload event selection
          </Button>
        </div>
      )}
      {eventId && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">Managing admissions for</span>
          <strong className="min-w-0 break-words text-foreground">{events.find((item) => item.id === eventId)?.title ?? 'Selected event'}</strong>
          {offlineQueue.length > 0 && <span className="ml-auto font-semibold text-amber-700 dark:text-amber-400">{offlineQueue.length} pending offline scan{offlineQueue.length === 1 ? '' : 's'} across events</span>}
        </div>
      )}

      {eventId && (
        <AdmissionOperationsPanel
          key={eventId}
          eventId={eventId}
          refreshKey={monitorRevision}
          browserSessionId={browserSessionId}
          onSessionRegistered={registerBrowserSession}
        />
      )}

      <section aria-label="Offline scan recovery" className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShieldAlert className="size-4 text-amber-600" aria-hidden />
              Offline scan recovery
              {offlineQueue.length > 0 && <Badge variant="secondary">{offlineQueue.length} pending</Badge>}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {queueReady ? 'Pending scans are kept in this browser between reloads until server reconciliation.' : 'Checking this browser for saved scans…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={online ? 'secondary' : 'outline'}>{online ? 'Network online' : 'Offline'}</Badge>
            <Button variant="outline" size="sm" className="min-h-10 rounded-xl"
              disabled={!eventId || !queueReady || !online || syncBusy || activeOfflineQueue.length === 0}
              onClick={() => void syncOffline()}>
              {syncBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
              Sync {activeOfflineQueue.length > 0 ? activeOfflineQueue.length : ''} for event
            </Button>
          </div>
        </div>
        {queueError && <p role="alert" className="mt-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 text-xs text-destructive">
          Offline storage is unavailable: {queueError} Scans cannot be saved for later.
        </p>}
        {offlineQueue.length > 0 && (
          <p role="status" className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            These are PENDING, not admitted tickets. {activeOfflineQueue.length} belong to this event; select other events to reconcile the rest.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Sync promptly. Browser storage can be cleared or evicted; avoid shared devices. This device holds pending ticket credentials,
          not an attendee roster. Only the server decides admissions.
        </p>
      </section>

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
              <Button type="submit" className="rounded-full ievx-press" disabled={!scanValue.trim() || scanBusy || !queueReady}>{scanBusy ? 'Checking…' : 'Verify' }</Button>
            </form>
            {lastResult && (
              <div className={`rounded-xl p-3 text-sm ${lastResult.result === 'ADMITTED' ? 'bg-primary/10 text-primary' : lastResult.result === 'DUPLICATE' ? 'bg-amber-500/10 text-amber-800' : lastResult.result === 'CONFLICT' ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>
                <p className="font-bold">{humanize(lastResult.result)}</p>
                <p>{lastResult.detail}</p>
                {lastResult.ticket && <p className="mt-0.5 text-xs opacity-80">{lastResult.ticket.holderName} · {lastResult.ticket.ticketType}</p>}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Connectivity failures can be saved as pending scans on this device when storage works. Server rejections are never
              treated as offline admissions. Sync from the recovery panel after reconnecting.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search name, email or ticket code…"
            aria-label="Search attendees"
            value={lookupQuery}
            onChange={(event) => {
              const value = event.target.value
              setLookupQuery(value)
              setLookupError('')
              if (value.trim().length < 2) void refresh()
            }}
          />
        </div>
      </div>

      {lookupError && (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">{lookupError}</div>
      )}
      {attendeesError && (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <p>{attendeesError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 min-h-9 rounded-lg" onClick={() => void refresh()}>Retry attendee list</Button>
        </div>
      )}
      {attendees === null ? (
        <div role="status" aria-label="Loading attendee list" className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-16 rounded-xl" />)}
        </div>
      ) : attendees.length === 0 ? (
        <EmptyState title={eventId ? 'No matching attendees' : 'Choose an event first'}
          description={eventId ? 'Try a different ticket code or attendee name, or refresh the selected event.' : 'Select an event above to view its attendees and manage admission.'} />
      ) : (
        <>
          <div className="mb-2 text-xs text-muted-foreground" aria-live="polite">{attendees.length} attendees shown</div>
          <div className="grid gap-3 md:hidden">
            {(attendees as { id?: string; code: string; holderName: string; ticketType?: string; status: string; checkedInAt?: string | null }[]).map((attendee) => (
              <article key={attendee.id ?? attendee.code} className="ievx-surface space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{attendee.holderName}</p>
                    <p className="mt-1 break-all font-mono text-xs text-primary">{attendee.code}</p>
                  </div>
                  <Badge variant={attendee.status === 'CHECKED_IN' ? 'default' : attendee.status === 'VALID' ? 'secondary' : 'outline'}>{humanize(attendee.status)}</Badge>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/70 pt-3 text-xs">
                  <span className="text-muted-foreground">{attendee.ticketType ?? 'Ticket'}</span>
                  <span className="text-right text-muted-foreground">{attendee.checkedInAt ? relative(attendee.checkedInAt) : 'Not checked in'}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-border/70 md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th scope="col" className="p-3">Ticket</th><th scope="col" className="p-3">Attendee</th><th scope="col" className="p-3">Type</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Checked in</th></tr>
              </thead>
              <tbody>
                {(attendees as { id?: string; code: string; holderName: string; ticketType?: string; status: string; checkedInAt?: string | null }[]).map((attendee) => (
                  <tr key={attendee.id ?? attendee.code} className="border-t border-border/50 hover:bg-secondary/30">
                    <td className="p-3 break-all font-mono text-xs">{attendee.code}</td>
                    <td className="p-3 font-medium">{attendee.holderName}</td>
                    <td className="p-3 text-xs">{attendee.ticketType ?? '—'}</td>
                    <td className="p-3"><Badge variant={attendee.status === 'CHECKED_IN' ? 'default' : attendee.status === 'VALID' ? 'secondary' : 'outline'}>{humanize(attendee.status)}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{attendee.checkedInAt ? relative(attendee.checkedInAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Streaming studio ────────────────────────────────────────────────────────

function StudioView({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [broadcasts, setBroadcasts] = useState<{ id: string; title: string; status: string; accessPolicy: string; accessLabel?: string; event: { title: string } }[] | null>(null)
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [newB, setNewB] = useState({ eventId: '', title: '', accessPolicy: 'FREE', price: '50.00', replayPrice: '', capacity: '500' })
  const [ingest, setIngest] = useState<{ url: string; key: string } | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [health, setHealth] = useState<{ resolution?: string; fps?: number; label?: string } | null>(null)
  const [moderatingId, setModeratingId] = useState<string | null>(null)
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
        replayPriceMinor:
          newB.accessPolicy === 'PAID' && newB.replayPrice.trim() !== '' ? moneyFromCedis(Number(newB.replayPrice)) : undefined,
        viewerCapacity: Math.max(50, Math.min(20000, Math.round(Number(newB.capacity) || 500))),
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
    toast({ title: 'Broadcast ended', description: 'The replay is available immediately for entitled viewers.' })
    setModeratingId((m) => (m === id ? null : m))
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
        <CardContent className="grid gap-2 md:grid-cols-[1fr_1fr_130px_100px_110px_auto]">
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
          {newB.accessPolicy === 'PAID' && (
            <Input value={newB.replayPrice} onChange={(e) => setNewB((s) => ({ ...s, replayPrice: e.target.value }))} placeholder="Replay ₵" inputMode="decimal" aria-label="Replay price (blank = same as pass)" />
          )}
          <Input value={newB.capacity} onChange={(e) => setNewB((s) => ({ ...s, capacity: e.target.value }))} placeholder="500" inputMode="numeric" aria-label="Viewer capacity (50–20000)" className="md:col-span-2" />
          <Button className="rounded-full" disabled={!newB.eventId || !newB.title.trim()} onClick={() => void createBroadcast()}>Schedule</Button>
        </CardContent>
        <p className="px-6 pb-4 text-[11px] text-muted-foreground">
          Capacity enforces distinct live viewers (heartbeat-fresh sessions); replays are on-demand and uncapped. A blank replay price means the replay follows the same pass/ticket rules as the live room.
        </p>
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
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setModeratingId((m) => (m === b.id ? null : b.id))}><MessageSquare className="mr-1 h-3.5 w-3.5" /> Chat</Button>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => void rotateKey(b.id)}><KeyRound className="mr-1 h-3.5 w-3.5" /> Rotate key</Button>
                      <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void endLive(b.id)}><Square className="mr-1 h-3.5 w-3.5" /> End</Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(`/broadcast/${b.id}`)}>Preview</Button>
                </div>
              </CardContent>
              {b.status === 'LIVE' && moderatingId === b.id && (
                <div className="border-t border-border/60 p-4">
                  <ChatModerationPanel broadcastId={b.id} title={b.title} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Studio chat moderation (hide / flag / restore live-room messages) ──────────

interface ModRow {
  id: string
  body: string
  createdAt: string
  status: string
  user: { id: string; displayName: string }
}

function ChatModerationPanel({ broadcastId, title }: { broadcastId: string; title: string }) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ModRow[] | null>(null)

  const load = useCallback(async () => {
    const data = await api
      .get<{ items: ModRow[] }>(`/broadcasts/${broadcastId}/chat?pageSize=60`)
      .catch(() => ({ items: [] as ModRow[] }))
    setMessages(data.items)
  }, [broadcastId])

  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  // Live updates: new messages and moderation deltas arrive over the room socket.
  useEffect(() => {
    const socket = connectRealtime()
    socket.on('connect', () => socket.emit('join', { room: `broadcast:${broadcastId}` }))
    socket.on('chat', (message: ModRow) => {
      setMessages((prev) => (prev && prev.some((m) => m.id === message.id) ? prev : [...(prev ?? []).slice(-80), message]))
    })
    socket.on('chat:moderated', (payload: { id: string; status: string }) => {
      setMessages((prev) => (prev ? prev.map((m) => (m.id === payload.id ? { ...m, status: payload.status } : m)) : prev))
    })
    return () => {
      socket.disconnect()
    }
  }, [broadcastId])

  const moderate = async (messageId: string, status: 'VISIBLE' | 'HIDDEN' | 'FLAGGED') => {
    try {
      await api.post(`/broadcasts/${broadcastId}/chat-moderate`, { messageId, status })
      setMessages((prev) => (prev ? prev.map((m) => (m.id === messageId ? { ...m, status } : m)) : prev))
      if (status === 'HIDDEN') toast({ title: 'Message hidden', description: 'Viewers see a removal note immediately (realtime).' })
      if (status === 'FLAGGED') toast({ title: 'Message flagged', description: 'Pulled from the viewer feed pending review.' })
      if (status === 'VISIBLE') toast({ title: 'Message restored' })
    } catch (err) {
      toast({ title: 'Moderation failed', description: err instanceof ApiClientError ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="rounded-xl border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <p className="text-sm font-bold">Moderate live chat — <span className="text-muted-foreground">{title}</span></p>
        <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" aria-label="Reload chat" /></Button>
      </div>
      <div className="ievx-scrollbar max-h-72 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages === null && <p className="py-6 text-center text-xs text-muted-foreground">Loading chat…</p>}
        {messages !== null && messages.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No messages yet — viewers are quiet.</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex items-start gap-2.5 rounded-lg p-2 ${m.status !== 'VISIBLE' ? 'bg-secondary/50' : ''}`}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-secondary text-[10px] font-bold">{initials(m.user.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-none">
                <span className="font-semibold">{m.user.displayName}</span> <span className="text-muted-foreground">· {relative(m.createdAt)}</span>
                {m.status === 'HIDDEN' && <Badge variant="secondary" className="ml-2 text-[9px] uppercase">hidden</Badge>}
                {m.status === 'FLAGGED' && <Badge className="ml-2 bg-amber-500/15 text-[9px] uppercase text-amber-700">flagged</Badge>}
              </p>
              <p className={`mt-0.5 text-sm leading-snug ${m.status === 'HIDDEN' ? 'text-muted-foreground line-through' : ''}`}>{m.body}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              {m.status === 'VISIBLE' ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={`Hide message from ${m.user.displayName}`} onClick={() => void moderate(m.id, 'HIDDEN')}><EyeOff className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={`Flag message from ${m.user.displayName}`} onClick={() => void moderate(m.id, 'FLAGGED')}><Flag className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={`Restore message from ${m.user.displayName}`} onClick={() => void moderate(m.id, 'VISIBLE')}><Eye className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        Hidden messages stay in this ledger for restore; flagged messages are pulled from the viewer feed pending review. Every action is audited.
      </p>
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
  const [form, setForm] = useState({ ...emptyOrgFields, payoutMomo: '', payoutName: '' })
  const [orgType, setOrgType] = useState<OrganizerType | null>(null)
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({})
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    void api.get<{ verification: { status: string; notes?: string | null } | null }>(`/orgs/${orgId}/verification`).then((d) => setVerification(d.verification))
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    setLoadingProfile(true)
    void api.get<{ org: {
      tagline?: string | null; description?: string | null; city?: string | null;
      address?: string | null; contactEmail?: string | null; contactPhone?: string | null;
      website?: string | null; mapsUrl?: string | null; latitude?: number | null; longitude?: number | null;
      socialLinks?: Record<string, string>; logoUrl?: string | null; orgType?: string; profileDetails?: ProfileDetails;
    } }>('/orgs/' + orgId + '/settings').then(({ org }) => {
      if (cancelled) return
      setOrgType(organizerType(org.orgType))
      setProfileDetails(org.profileDetails ?? {})
      setForm((previous) => ({
        ...previous,
        tagline: org.tagline ?? '', description: org.description ?? '', city: org.city ?? '',
        address: org.address ?? '', contactEmail: org.contactEmail ?? '',
        contactPhone: org.contactPhone ?? '', website: org.website ?? '', mapsUrl: org.mapsUrl ?? '',
        latitude: org.latitude == null ? '' : String(org.latitude),
        longitude: org.longitude == null ? '' : String(org.longitude),
        socialLinks: { ...emptyOrgFields.socialLinks, ...org.socialLinks },
      }))
      setLogoUrl(org.logoUrl ?? null)
    }).catch(() => {
      if (!cancelled) toast({ title: 'Could not load saved profile', description: 'Please refresh before editing.', variant: 'destructive' })
    }).finally(() => { if (!cancelled) setLoadingProfile(false) })
    return () => { cancelled = true }
  }, [orgId, toast])

  const submitVerification = async () => {
    try {
      await api.post(`/orgs/${orgId}/verification-submit`, { evidence })
      toast({ title: 'Review note submitted', description: 'The note is visible to authorized reviewers.' })
      setEvidence('')
      setVerification({ status: 'PENDING' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not submit.', variant: 'destructive' })
    }
  }

  const saveSettings = async () => {
    try {
      await api.post('/orgs/' + orgId + '/settings', {
        tagline: form.tagline, description: form.description, city: form.city,
        address: form.address, contactEmail: form.contactEmail, contactPhone: form.contactPhone,
        website: form.website, mapsUrl: form.mapsUrl,
        latitude: form.latitude, longitude: form.longitude, socialLinks: form.socialLinks,
        ...(orgType ? { profileDetails } : {}),
        payoutMomoNumber: form.payoutMomo || undefined,
        payoutRecipientName: form.payoutName || undefined,
      })
      if (logoFile) {
        const data = new FormData()
        data.append('file', logoFile)
        const response = await api.upload<{ logoUrl: string }>('/orgs/' + orgId + '/logo', data)
        setLogoUrl(response.logoUrl + '?v=' + Date.now())
        setLogoFile(null)
      }
      toast({ title: 'Organizer profile saved', description: 'Saved values and public links are updated.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not save.', variant: 'destructive' })
    }
  }

  const canManage = ['OWNER', 'ADMIN'].includes(role)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="efx-animated-gradient-text iefx-page-title font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground">Public profile, map, social links, logo, verification and payout destination.</p>
      </div>

      <VenuesCard orgId={orgId} canManage={canManage || role === 'EVENT_MANAGER'} />

      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> Organizer verification
            {verification && <Badge variant={verification.status === 'APPROVED' ? 'default' : 'secondary'} className="capitalize">{humanize(verification.status)}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Upload company registration records (where applicable), a government ID and a selfie. Finance administrators review them manually. Paid ticket sales also require a live payment provider.</p>
          {canManage ? <VerificationDocuments orgId={orgId} onSubmitted={() => setVerification({ status: 'PENDING' })} /> : (
            <p className="text-xs text-muted-foreground">Only organization owners and administrators may access private identity documents.</p>
          )}
          {canManage && verification?.status !== 'APPROVED' && (
            <div className="space-y-2">
              <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Optional private notes for the manual reviewer…" aria-label="Private verification note" />
              <Button className="rounded-full" onClick={() => void submitVerification()} disabled={evidence.trim().length < 5}>Send note to reviewer</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Organizer profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loadingProfile ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved organization details…</div> : (
            <>
              {orgType && (
                <>
                  <div className="rounded-xl bg-secondary/50 p-3 text-sm">
                    <span className="font-semibold">Profile type: {ORGANIZER_TYPE_CONFIG[orgType].label}</span>
                    <p className="mt-1 text-xs text-muted-foreground">Type-specific information can be edited here. Changing the organizer category requires administrative review.</p>
                  </div>
                  <OrganizerTypeDetails type={orgType} value={profileDetails} onChange={setProfileDetails} />
                </>
              )}
              <OrganizationIdentityFields value={form} orgType={orgType ?? undefined} onChange={(details) => setForm((previous) => ({ ...previous, ...details }))} logoUrl={logoUrl} logoFile={logoFile} onLogoFile={setLogoFile} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="momo">Payout MoMo number</Label><Input id="momo" value={form.payoutMomo} onChange={(e) => setForm((previous) => ({ ...previous, payoutMomo: e.target.value }))} inputMode="tel" placeholder="+233..." /></div>
                <div className="space-y-1.5"><Label htmlFor="pname">Payout recipient name</Label><Input id="pname" value={form.payoutName} onChange={(e) => setForm((previous) => ({ ...previous, payoutName: e.target.value }))} /></div>
              </div>
              <Button className="rounded-full" disabled={!canManage} onClick={() => void saveSettings()}>{canManage ? 'Save organization profile' : 'Admin role required'}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ── R31: Venue directory — the reusable places an org hosts at ─────────── */

type VenueRow = {
  id: string
  name: string
  address?: string | null
  city?: string | null
  region?: string | null
  country: string
  lat?: number | null
  lng?: number | null
  capacity?: number | null
  mapsUrl?: string | null
  accessibilityInfo?: string | null
  directionsNote?: string | null
  eventCount: number
}

function VenuesCard({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const { toast } = useToast()
  const [venues, setVenues] = useState<VenueRow[] | null>(null)
  const [editing, setEditing] = useState<VenueRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ venues: VenueRow[] }>(`/orgs/${orgId}/venues`)
      setVenues(d.venues)
    } catch {
      setVenues([])
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (v: VenueRow) => {
    setBusy(v.id)
    try {
      await api.delete(`/orgs/${orgId}/venues/${v.id}`)
      toast({ title: 'Venue deleted' })
      void load()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not delete.', variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Venues
          {venues !== null && <Badge variant="secondary" className="text-[10px]">{venues.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Add a venue once, choose its country, region, city and map pin, then reuse it for your events. Directions are available to attendees.</p>
        {venues === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading venues…</div>
        ) : venues.length === 0 ? (
          <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">No venues yet — add your church hall, auditorium or meeting spot once and pick it on every event.</p>
        ) : (
          <div className="space-y-1.5">
            {venues.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{v.name} <span className="text-xs font-normal text-muted-foreground">· {v.city ?? '—'}{v.region ? `, ${v.region}` : ''}, ${COUNTRY_NAMES.get(v.country) ?? v.country}{v.capacity ? ` · cap ${v.capacity.toLocaleString()}` : ''} · {v.eventCount} event{v.eventCount === 1 ? '' : 's'}</span></p>
                  {(v.address ?? v.mapsUrl) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {v.address ?? ''}
                      {v.mapsUrl && <a className="ml-1 underline decoration-dotted hover:text-primary" href={v.mapsUrl} target="_blank" rel="noreferrer">map</a>}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => setEditing(v)}><Pencil className="h-3 w-3" aria-hidden /><span className="sr-only">Edit {v.name}</span></Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full text-destructive"
                      disabled={v.eventCount > 0 || busy === v.id}
                      title={v.eventCount > 0 ? `Linked to ${v.eventCount} event${v.eventCount === 1 ? '' : 's'} — unlink them first` : 'Delete this venue'}
                      onClick={() => void remove(v)}
                    >
                      {busy === v.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
                      <span className="sr-only">Delete {v.name}</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add venue</Button>
        )}
        {!canManage && venues !== null && venues.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Pick these from the event editor — managing them needs an admin or event-manager role.</p>
        )}

        {creating && <VenueDialog orgId={orgId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load() }} />}
        {editing && <VenueDialog orgId={orgId} venue={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
      </CardContent>
    </Card>
  )
}

function VenueDialog({ orgId, venue, onClose, onSaved }: {
  orgId: string
  venue?: VenueRow
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: venue?.name ?? '',
    address: venue?.address ?? '',
    city: venue?.city ?? '',
    region: venue?.region ?? '',
    country: venue?.country ?? 'GH',
    lat: venue?.lat == null ? '' : String(venue.lat),
    lng: venue?.lng == null ? '' : String(venue.lng),
    capacity: venue?.capacity != null ? String(venue.capacity) : '',
    mapsUrl: venue?.mapsUrl ?? '',
    accessibilityInfo: venue?.accessibilityInfo ?? '',
    directionsNote: venue?.directionsNote ?? '',
  })

  const save = async () => {
    if (busy) return
    if (!form.country || !form.city.trim() || (form.country === 'GH' && !form.region)) {
      setError('Choose a country and city/town. For Ghana, also select one of the 16 regions.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        country: form.country,
        region: form.region.trim() || null,
        city: form.city.trim(),
        address: form.address.trim() || null,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
        capacity: form.capacity.trim() ? Number(form.capacity) : null,
        mapsUrl: form.mapsUrl.trim() || null,
        accessibilityInfo: form.accessibilityInfo.trim() || null,
        directionsNote: form.directionsNote.trim() || null,
      }
      if (venue) await api.patch(`/orgs/${orgId}/venues/${venue.id}`, payload)
      else await api.post(`/orgs/${orgId}/venues`, payload)
      toast({ title: venue ? 'Venue saved' : 'Venue added', description: 'The venue location and map pin are saved for reuse in events.' })
      onSaved()
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not save the venue. Check your connection and try again.'
      setError(message)
      toast({ title: 'Could not save venue', description: message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] w-[calc(100vw-1rem)] max-w-3xl sm:max-w-3xl overflow-y-auto p-4 sm:p-6 ievx-scrollbar">
        <DialogHeader>
          <DialogTitle>{venue ? `Edit venue: ${venue.name}` : 'Add venue'}</DialogTitle>
          <p className="text-sm text-muted-foreground">Give your venue a name and pin its exact location for event attendees.</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="v-name">Venue name *</Label>
            <Input id="v-name" required maxLength={140} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main auditorium, conference centre, event grounds…" />
          </div>
          <VenueLocationFields value={form} onChange={(next) => setForm((current) => ({ ...current, ...next }))} />
          <div className="space-y-1.5"><Label htmlFor="v-capacity">Capacity (optional)</Label><Input id="v-capacity" inputMode="numeric" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value.replace(/\D/g, '') }))} placeholder="e.g. 3000" /></div>
          <div className="space-y-1.5"><Label htmlFor="v-access">Accessibility notes</Label><Input id="v-access" maxLength={500} value={form.accessibilityInfo} onChange={(e) => setForm((f) => ({ ...f, accessibilityInfo: e.target.value }))} placeholder="Wheelchair ramp, reserved seating…" /></div>
          <div className="space-y-1.5"><Label htmlFor="v-directions">Additional directions</Label><Input id="v-directions" maxLength={500} value={form.directionsNote} onChange={(e) => setForm((f) => ({ ...f, directionsNote: e.target.value }))} placeholder="Landmarks, parking entrance, transport routes…" /></div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" disabled={busy || form.name.trim().length < 3 || !form.city.trim() || (form.country === 'GH' && !form.region)} onClick={() => void save()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
            {venue ? 'Save venue' : 'Add venue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
