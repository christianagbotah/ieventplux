'use client'

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Compass, Radio, Film, UsersRound, ShoppingBag, Search, Ticket, LayoutDashboard, ShieldCheck, LogOut, Bell, MessageCircle, Sparkles, UserRound, Command as CommandIcon } from 'lucide-react'
import { connectRealtime } from './realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { useRoute, navigate } from './router'
import { usePortal, isOrganizer, isPlatformStaff } from './store'
import { api } from './api'
import { animateIn, animateOut } from './animate'
import { initials } from './format'
import { VoiceAssistant } from './components/VoiceAssistant'
import { ConnectionStatus } from './components/ConnectionStatus'
import { ThemeToggle } from './components/ThemeToggle'
import { CommandPalette } from './components/CommandPalette'
import { EffectsRuntime } from './components/EffectsRuntime'
import { EventCardSkeleton } from './components/EventCard'
import { MeetingErrorBoundary } from './components/MeetingErrorBoundary'
import IncomingCallInvitation from './components/IncomingCallInvitation'

const Discover = lazy(() => import('./views/Discover'))
const EventDetail = lazy(() => import('./views/EventDetail'))
const EventCompareView = lazy(() => import('./views/EventCompareView'))
const LiveNow = lazy(() => import('./views/LiveNow'))
const Reels = lazy(() => import('./views/Reels'))
const FollowingFeed = lazy(() => import('./views/FollowingFeed'))
const TransportCharterPlanner = lazy(() => import('./views/TransportCharterPlanner'))
const TransportDriverRoster = lazy(() => import('./views/TransportDriverRoster'))
const ServiceEnquiries = lazy(() => import('./views/ServiceEnquiries'))
const ServiceDirectory = lazy(() => import('./views/ServiceDirectory'))
const MarketplaceExplore = lazy(() => import('./views/MarketplaceExplore'))
const MarketplaceStorefront = lazy(() => import('./views/MarketplaceStorefront'))
const MarketplaceSellerStudio = lazy(() => import('./views/MarketplaceSellerStudio'))
const EffectsStudio = lazy(() => import('./views/EffectsStudio'))
const OrgProfile = lazy(() => import('./views/OrgProfile'))
const AuthView = lazy(() => import('./views/AuthView'))
const VerifyEmail = lazy(() => import('./views/VerifyEmail'))
const Me = lazy(() => import('./views/Me'))
const DirectMessages=lazy(()=>import('./views/DirectMessages'))
const OrderView = lazy(() => import('./views/OrderView'))
const BroadcastView = lazy(() => import('./views/BroadcastView'))
const MeetingView = lazy(() => import('./views/MeetingView'))
const OrganizerWorkspace = lazy(() => import('./views/OrganizerWorkspace'))
const AdminConsole = lazy(() => import('./views/AdminConsole'))
const CreateOrg = lazy(() => import('./views/CreateOrg'))
const ClaimTicket = lazy(() => import('./views/ClaimTicket'))
const InviteRedeem = lazy(() => import('./views/InviteRedeem'))
const AiStudio = lazy(() => import('./views/AiStudio'))

function ViewFallback() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

const NAV = [
  { path: '/', label: 'Discover', icon: Compass },
  { path: '/following', label: 'Following', icon: UsersRound },
  { path: '/live', label: 'Live Now', icon: Radio },
  { path: '/reels', label: 'Reels', icon: Film },
  { path: '/shop', label: 'Shop', icon: ShoppingBag },
  { path: '/services', label: 'Services', icon: Compass },
]

const MOBILE_NAV = [
  { path: '/', label: 'Discover', icon: Compass, tab: '' },
  { path: '/following', label: 'Feed', icon: UsersRound, tab: '' },
  { path: '/reels', label: 'Reels', icon: Film, tab: '' },
  { path: '/shop', label: 'Shop', icon: ShoppingBag, tab: '' },
  { path: '/me?tab=tickets', label: 'Tickets', icon: Ticket, tab: 'tickets' },
  { path: '/me?tab=profile', label: 'Account', icon: UserRound, tab: 'profile' },
]

export default function AppPortal() {
  const route = useRoute()
  // Workspace pages own two viewport-bounded scroll panes; public pages retain document scrolling.
  const workspaceMode = route.segments[0] === 'admin' || route.segments[0] === 'organizer'
  // Keep immersive media and workspace canvases separate from ordinary content.
  const immersiveMode = ['meeting','broadcast','reels','effects'].includes(route.segments[0] ?? '')
  const { user, memberships, unread, setUser, setMemberships, setUnread, setRealtimeConnected, setBooted } = usePortal()
  const { toast } = useToast()
  const viewRef = useRef<HTMLDivElement>(null)
  const prevPathRef = useRef<string>('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Session bootstrap.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await api.get<{ user: typeof user; memberships: typeof memberships }>('/auth/me')
        if (cancelled) return
        setUser(me.user)
        setMemberships(me.memberships ?? [])
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        // The session check has spoken — private views may now act on `user`.
        if (!cancelled) setBooted(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Server counts are authoritative, including missed and cross-device reads.
  const notificationUserId = user?.id
  useEffect(() => {
    if (!notificationUserId) { setUnread(0); return }
    let active = true
    let revision = 0
    const seen = new Set<string>()
    const refresh = async () => {
      const current = ++revision
      try {
        const data = await api.get<{ unread: number }>('/notifications?pageSize=1')
        if (!active || current !== revision) return
        setUnread(data.unread)
        window.dispatchEvent(new Event('ievx:notifications-changed'))
      } catch { /* retain the last confirmed state while offline */ }
    }
    const socket = connectRealtime()
    socket.on('connect', () => {
      setRealtimeConnected(true)
      socket.emit('join', { room: `user:${notificationUserId}` })
      void refresh()
    })
    socket.on('room:joined', () => void refresh())
    socket.on('disconnect', () => setRealtimeConnected(false))
    socket.on('room:denied', () => setRealtimeConnected(false))
    socket.on('notification', (payload: { id: string; title: string; body: string }) => {
      if (!active) return
      if (payload.id && !seen.has(payload.id)) {
        if (seen.size >= 500) seen.clear()
        seen.add(payload.id)
        toast({ title: payload.title, description: payload.body })
      }
      void refresh()
    })
    socket.on('notification:read', () => void refresh())
    socket.on('direct:changed',()=>{if(active)window.dispatchEvent(new Event('ievx:direct-changed'))})
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(onVisible, 15000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    void refresh()
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      socket.disconnect()
      setRealtimeConnected(false)
    }
  }, [notificationUserId, setRealtimeConnected, setUnread, toast])

  // jQuery-powered view transition: fade out, swap, fade in.
  useEffect(() => {
    const changed = prevPathRef.current !== route.path && prevPathRef.current !== ''
    prevPathRef.current = route.path
    if (!changed) return
    const el = viewRef.current
    if (!el) return
    let cancelled = false
    void (async () => {
      await animateOut(el, 130)
      if (cancelled) return
      window.scrollTo({ top: 0, behavior: 'auto' })
      await animateIn(el, 190)
    })()
    return () => {
      cancelled = true
    }
  }, [route.path])

  // Global command palette shortcut (⌘K / Ctrl+K).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const doLogout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    setUser(null)
    setMemberships([])
    navigate('/')
    toast({ title: 'Signed out', description: 'Your session was revoked on this device.' })
  }, [setUser, setMemberships, toast])

  const view = (() => {
    const [head, param] = route.segments
    switch (head) {
      case undefined:
        return <Discover route={route} />
      case 'live':
        return <LiveNow />
      case 'reels':
        return <Reels />
      case 'following':
        return <FollowingFeed />
      case 'shop':
        return param ? <MarketplaceStorefront key={param} slug={param} /> : <MarketplaceExplore />
      case 'services':
        return param==='charters'?<TransportCharterPlanner/>:param==='drivers'?<TransportDriverRoster/>:param==='enquiries'?<ServiceEnquiries route={route}/>:<ServiceDirectory key={param||'discover'} manage={param==='manage'}/>
      case 'seller':
        return <MarketplaceSellerStudio />
      case 'effects':
        return <EffectsStudio />
      case 'event':
        return param ? <EventDetail key={param} slug={param} /> : <Discover route={route} />
      case 'compare':
        return <EventCompareView route={route} />
      case 'org':
        return param ? <OrgProfile key={param} slug={param} /> : <Discover route={route} />
      case 'signin':
      case 'register':
        return <AuthView mode={head === 'register' ? 'register' : 'signin'} />
      case 'verify-email':
        return <VerifyEmail />
      case 'messages':
        return <DirectMessages id={param}/>
      case 'me':
        return <Me key={user?.id ?? "anonymous"} route={route} />
      case 'order':
        return param ? <OrderView key={param} reference={param} /> : <Discover route={route} />
      case 'broadcast':
        return param ? <BroadcastView key={param} id={param} /> : <LiveNow />
      case 'meeting':
        return param ? <MeetingErrorBoundary scope="page" key={param}><MeetingView id={param} /></MeetingErrorBoundary> : <Discover route={route} />
      case 'organizer':
        return <OrganizerWorkspace route={route} />
      case 'admin':
        return <AdminConsole route={route} />
      case 'create-org':
        return <CreateOrg />
      case 'ai-studio':
        return <AiStudio />
      case 'claim':
        return param ? <ClaimTicket token={param} /> : <Discover route={route} />
      case 'invite':
        return param ? <InviteRedeem key={param} code={param} /> : <Discover route={route} />
      case 'search':
        return <Discover route={route} />
      default:
        return <Discover route={route} />
    }
  })()

  const activeNav = (path: string) => (path === '/' ? ['', 'search'].includes(route.segments[0]) : route.segments[0] === path.slice(1))

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Effects Studio catalog — globally available efx-* classes for every view. */}
      <EffectsRuntime />
      {user&&<IncomingCallInvitation key={user.id} userId={user.id} visible={!immersiveMode} currentThread={route.segments[0]==='messages'?route.segments[1]:undefined}/>}
      {/* A #main anchor would be mistaken for an SPA route by the hash router. */}
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-xl"
      >
        Skip to content
      </button>

      <header className="ievx-application-bar sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-3 sm:px-5 lg:px-7">
          <button type="button" className="flex shrink-0 items-center gap-2.5 ievx-press" onClick={() => navigate('/')} aria-label="iEventPlux home">
            <span className="ievx-brand-mark flex h-8 w-8 items-center justify-center rounded-lg">
              <Ticket className="h-5 w-5" aria-hidden />
            </span>
            <span className="ievx-brand-name hidden text-[16px] font-extrabold min-[380px]:inline sm:text-[17px]">
              iEvent<span className="text-primary">Plux</span>
            </span>
          </button>

          <nav className={`hidden items-center gap-1 lg:flex ${workspaceMode ? 'lg:hidden' : ''}`} aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={activeNav(item.path) ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                className={`flex items-center gap-1.5 ievx-primary-nav-item rounded-xl px-3 py-2 text-sm font-semibold transition-colors ievx-press ${
                  activeNav(item.path) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {/* Tablets use the bottom navigation; desktop keeps compact icons until XL. */}
                <span className="hidden xl:inline">{item.label}</span>
              </button>
            ))}
          </nav>

          <form
            className={`ml-auto hidden max-w-xs flex-1 items-center ${workspaceMode || ['', 'search'].includes(route.segments[0] ?? '') ? '' : 'xl:flex'}`}
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement | null)
              if (input?.value.trim()) navigate(`/search?q=${encodeURIComponent(input.value.trim())}`)
            }}
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                type="search"
                placeholder="Search events, organizers…"
                aria-label="Search events"
                className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-base outline-none shadow-sm transition-[border-color,box-shadow] hover:border-primary/35 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15"
              />
            </div>
          </form>

          {workspaceMode && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="ml-auto hidden items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:inline-flex"
            >
              <Compass className="size-4" aria-hidden /> Browse events
            </button>
          )}
          <div className={`ml-auto flex shrink-0 items-center gap-1 lg:gap-1.5 ${workspaceMode ? 'md:ml-2' : ''}`}>
            <Button variant="ghost" size="icon" className="rounded-full xl:hidden" aria-label="Search events" onClick={() => navigate('/search')}>
              <Search className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-lg lg:inline-flex"
              aria-label="Open command palette (Ctrl+K)"
              title="Command palette (Ctrl+K)"
              onClick={() => setPaletteOpen(true)}
            >
              <CommandIcon className="h-5 w-5" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full lg:hidden" aria-label="Watch live events" onClick={() => navigate('/live')}>
              <Radio className="size-5" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="hidden rounded-full sm:inline-flex lg:hidden" aria-label="Local services" onClick={() => navigate('/services')}><Compass className="size-5" aria-hidden /></Button>
            <div className="hidden sm:block"><ThemeToggle /></div>
            {user ? (
              <>
                <Button variant="ghost" size="icon" className="hidden rounded-lg xl:inline-flex" aria-label="Messages" onClick={()=>navigate('/messages')}><MessageCircle className="size-5"/></Button>
                <Button variant="ghost" size="icon" className="relative rounded-lg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={() => navigate('/me?tab=notifications')}>
                  <Bell className="h-5 w-5" />
                  {/* Effects Studio: badge-ping ring behind the unread counter. */}
                  {unread > 0 && (
                    <>
                      <span className="efx-badge-ping__ping" aria-hidden style={{ top: 6, right: 6, width: 9, height: 9 }} />
                      <span className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
                    </>
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-xl border border-border/80 bg-card p-1 pr-3 shadow-sm transition-[border-color,background-color,box-shadow] hover:border-primary/35 hover:bg-secondary/30 hover:shadow-md ievx-press" aria-label="Account menu">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{initials(user.displayName)}</AvatarFallback>
                      </Avatar>
                      <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{user.displayName.split(' ')[0]}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>
                      <p className="text-sm font-semibold">{user.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      {isOrganizer(user, memberships) && (
                        <Badge className="mt-1.5" variant="secondary">Organizer · {memberships.length} org{memberships.length > 1 ? 's' : ''}</Badge>
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!user.emailVerifiedAt && <DropdownMenuItem onClick={() => navigate('/verify-email')}>Verify email address</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => navigate('/messages')}><MessageCircle className="h-4 w-4" /> Messages</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/me?tab=tickets')}>
                      <Ticket className="h-4 w-4" /> My Tickets
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/following')}>
                      <UsersRound className="h-4 w-4" /> My Following feed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/me?tab=orders')}>
                      <UserRound className="h-4 w-4" /> Orders & Profile
                    </DropdownMenuItem>
                    {isOrganizer(user, memberships) && (
                      <DropdownMenuItem onClick={() => navigate('/ai-studio')}>
                        <Sparkles className="h-4 w-4" /> AI Content Studio
                      </DropdownMenuItem>
                    )}
                    {isOrganizer(user, memberships) && (
                      <>
                        <DropdownMenuItem onClick={() => navigate('/organizer')}>
                          <LayoutDashboard className="h-4 w-4" /> Organizer Workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate('/organizer?tab=meetings')}>
                          <UsersRound className="h-4 w-4" /> Group Meetings
                        </DropdownMenuItem>
                      </>
                    )}
                    {!isOrganizer(user, memberships) && (
                      <DropdownMenuItem onClick={() => navigate('/create-org')}>
                        <Sparkles className="h-4 w-4" /> Start organizing
                      </DropdownMenuItem>
                    )}
                    {isPlatformStaff(user) && (
                      <DropdownMenuItem onClick={() => navigate('/admin')}>
                        <ShieldCheck className="h-4 w-4" /> Platform Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => navigate('/services/manage')}>
                      <Compass className="h-4 w-4" /> My service profiles
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void doLogout()} variant="destructive">
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="ghost" className="hidden rounded-full sm:flex" onClick={() => navigate('/signin')}>Sign in</Button>
                <Button className="rounded-full px-3 sm:px-4 ievx-press" onClick={() => navigate('/register')}><span className="sm:hidden">Join</span><span className="hidden sm:inline">Get started</span></Button>
              </>
            )}
          </div>
        </div>
        {/* Offline banner + service-worker registration — sticks under the glass bar. */}
        <ConnectionStatus />
      </header>

      <main id="main" tabIndex={-1} ref={viewRef} className={`min-w-0 flex-1 outline-none ${workspaceMode ? 'ievx-workspace pb-6 md:h-[calc(100dvh-4rem)] md:min-h-0 md:flex-none md:overflow-hidden md:pb-0' : 'ievx-public pb-24 lg:pb-10'}`}>
        {user && !user.emailVerifiedAt && route.path !== '/verify-email' && !workspaceMode && !immersiveMode && <div className="mx-auto flex max-w-[1152px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6" role="status"><span className="text-muted-foreground">Your email is not verified.</span><a href="#/verify-email" className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4">Verify email</a></div>}
        <Suspense fallback={<ViewFallback />}>
          <div key={route.path} className={`ievx-view-enter ${workspaceMode ? 'md:h-full' : immersiveMode ? '' : 'ievx-page-shell'}`}>{view}</div>
        </Suspense>
      </main>

      {/* pb on mobile clears the fixed bottom nav + iOS safe-area inset; md: clears it since the nav is hidden.
          R19b: pr-20 clears the fixed voice-concierge FAB (56px + right-4 + gap = 80px) — at page bottom it
          overlapped and blocked the right edge of the footer link row. R20: the dev-only Effects Studio
          footer link was removed with its menu entries; the /effects route stays reachable by direct URL. */}
      <footer className={`mt-auto border-t border-border/60 bg-card pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 ${workspaceMode ? 'hidden' : ''}`}>
        <div className="ievx-page-shell flex flex-col gap-3 px-4 py-6 pr-20 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} iEventPlux · Lightworld Technologies Ltd. · Accra, Ghana</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Ticketing · Social · Broadcasting · Marketplace</span>
            <span aria-hidden>·</span>
            <span>View prices in each event’s currency</span>
          </p>
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className={`${workspaceMode ? 'hidden' : 'fixed'} inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-3px_14px_rgb(16_35_51_/_0.06)] lg:hidden`} aria-label="Mobile primary">
        <div className="mx-auto flex min-h-16 max-w-lg items-center justify-around px-0 min-[360px]:px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
          {MOBILE_NAV.map((item) => {
            const active = item.path.startsWith('/me')
              ? route.segments[0] === 'me' && (route.query.get('tab') ?? 'tickets') === item.tab
              : activeNav(item.path)
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 ievx-mobile-nav-item rounded-xl px-0 min-[360px]:px-0.5 py-1.5 text-[10px] font-semibold transition-colors min-[360px]:text-[11px] sm:text-xs ievx-press ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {!workspaceMode && <VoiceAssistant />}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onLogout={() => void doLogout()}
      />
    </div>
  )
}
