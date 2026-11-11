'use client'

import { Suspense, lazy, useCallback, useEffect, useRef } from 'react'
import { Compass, Radio, Film, Palette, Search, Ticket, LayoutDashboard, ShieldCheck, LogOut, Bell, Menu, Sparkles, UserRound } from 'lucide-react'
import { io } from 'socket.io-client'
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
import { EventCardSkeleton } from './components/EventCard'

const Discover = lazy(() => import('./views/Discover'))
const EventDetail = lazy(() => import('./views/EventDetail'))
const LiveNow = lazy(() => import('./views/LiveNow'))
const Reels = lazy(() => import('./views/Reels'))
const EffectsStudio = lazy(() => import('./views/EffectsStudio'))
const OrgProfile = lazy(() => import('./views/OrgProfile'))
const AuthView = lazy(() => import('./views/AuthView'))
const Me = lazy(() => import('./views/Me'))
const OrderView = lazy(() => import('./views/OrderView'))
const BroadcastView = lazy(() => import('./views/BroadcastView'))
const OrganizerWorkspace = lazy(() => import('./views/OrganizerWorkspace'))
const AdminConsole = lazy(() => import('./views/AdminConsole'))
const CreateOrg = lazy(() => import('./views/CreateOrg'))
const ClaimTicket = lazy(() => import('./views/ClaimTicket'))

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
  { path: '/live', label: 'Live Now', icon: Radio },
  { path: '/reels', label: 'Reels', icon: Film },
  { path: '/effects', label: 'Effects Studio', icon: Palette },
]

export default function AppPortal() {
  const route = useRoute()
  const { user, memberships, unread, setUser, setMemberships, setUnread, setRealtimeConnected } = usePortal()
  const { toast } = useToast()
  const viewRef = useRef<HTMLDivElement>(null)
  const prevPathRef = useRef<string>('')

  // Session bootstrap.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await api.get<{ user: typeof user; memberships: typeof memberships }>('/auth/me')
        if (cancelled) return
        setUser(me.user)
        setMemberships(me.memberships ?? [])
        const notif = await api.get<{ unread: number }>('/notifications').catch(() => ({ unread: 0 }))
        if (!cancelled) setUnread(notif.unread ?? 0)
      } catch {
        if (!cancelled) setUser(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Realtime notifications over the gateway WebSocket (port ONLY in XTransformPort).
  useEffect(() => {
    if (!user) return
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 6,
      reconnectionDelay: 1200,
      timeout: 10000,
    })
    socket.on('connect', () => {
      setRealtimeConnected(true)
      socket.emit('join', { room: `user:${user.id}` })
    })
    socket.on('disconnect', () => setRealtimeConnected(false))
    socket.on('notification', (payload: { title: string; body: string; link?: string }) => {
      setUnread(usePortal.getState().unread + 1)
      toast({ title: payload.title, description: payload.body })
    })
    return () => {
      socket.disconnect()
      setRealtimeConnected(false)
    }
  }, [user, setRealtimeConnected, setUnread, toast])

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
      case 'effects':
        return <EffectsStudio />
      case 'event':
        return param ? <EventDetail key={param} slug={param} /> : <Discover route={route} />
      case 'org':
        return param ? <OrgProfile key={param} slug={param} /> : <Discover route={route} />
      case 'signin':
      case 'register':
        return <AuthView mode={head === 'register' ? 'register' : 'signin'} />
      case 'me':
        return <Me route={route} />
      case 'order':
        return param ? <OrderView key={param} reference={param} /> : <Discover route={route} />
      case 'broadcast':
        return param ? <BroadcastView key={param} id={param} /> : <LiveNow />
      case 'organizer':
        return <OrganizerWorkspace route={route} />
      case 'admin':
        return <AdminConsole route={route} />
      case 'create-org':
        return <CreateOrg />
      case 'claim':
        return param ? <ClaimTicket token={param} /> : <Discover route={route} />
      case 'search':
        return <Discover route={route} />
      default:
        return <Discover route={route} />
    }
  })()

  const activeNav = (path: string) => (path === '/' ? ['', 'search'].includes(route.segments[0]) : route.segments[0] === path.slice(1))

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border/60 ievx-glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <button className="flex items-center gap-2.5 ievx-press" onClick={() => navigate('/')} aria-label="iEventPlux home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Ticket className="h-5 w-5" aria-hidden />
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight sm:block">
              iEvent<span className="ievx-gradient-text">Plux</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={activeNav(item.path) ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ievx-press ${
                  activeNav(item.path) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            ))}
          </nav>

          <form
            className="ml-auto hidden max-w-xs flex-1 items-center lg:flex"
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
                className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {user ? (
              <>
                <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={() => navigate('/me?tab=notifications')}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-full border border-border/70 bg-card p-1 pr-3 ievx-press" aria-label="Account menu">
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
                    <DropdownMenuItem onClick={() => navigate('/me?tab=tickets')}>
                      <Ticket className="h-4 w-4" /> My Tickets
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/me?tab=orders')}>
                      <UserRound className="h-4 w-4" /> Orders & Profile
                    </DropdownMenuItem>
                    {isOrganizer(user, memberships) && (
                      <DropdownMenuItem onClick={() => navigate('/organizer')}>
                        <LayoutDashboard className="h-4 w-4" /> Organizer Workspace
                      </DropdownMenuItem>
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
                <Button className="rounded-full ievx-press" onClick={() => navigate('/register')}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" ref={viewRef} className="flex-1 pb-24 md:pb-10">
        <Suspense fallback={<ViewFallback />}>
          <div key={route.raw} className="ievx-view-enter">{view}</div>
        </Suspense>
      </main>

      {/* pb on mobile clears the fixed bottom nav + iOS safe-area inset; md: clears it since the nav is hidden */}
      <footer className="mt-auto border-t border-border/60 bg-card pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} iEventPlux · Lightworld Technologies Ltd. · Accra, Ghana</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Ticketing · Social · Broadcasting</span>
            <span aria-hidden>·</span>
            <span>Prices in Ghana cedis (₵)</span>
            <span aria-hidden>·</span>
            <button className="underline-offset-2 hover:text-foreground hover:underline" onClick={() => navigate('/effects')}>CSS Effects Studio</button>
          </p>
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 ievx-glass md:hidden" aria-label="Mobile primary">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {[...NAV, { path: '/me', label: 'Me', icon: Menu }].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={activeNav(item.path) ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10.5px] font-medium ievx-press ${
                activeNav(item.path) ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <VoiceAssistant />
    </div>
  )
}
