'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ticket, ShoppingBag, Heart, Bell, UserRound, Share2, Check, RefreshCw, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate, type Route } from '../router'
import { usePortal } from '../store'
import { money, dateLong, relative, humanize, statusTone, initials } from '../format'
import { EmptyState } from '../components/EventCard'
import { cacheTicketList, cacheTicketDetail, readCachedTicketList, readCachedTicketDetail, type CachedTicketDetail, type CachedTicketRow } from '../lib/ticket-cache'

interface TicketRow {
  id: string
  code: string
  status: string
  checkedInAt?: string | null
  ticketType: { name: string; kind: string; includesVirtualAccess: boolean }
  event: { id: string; title: string; slug: string; startsAt: string; endsAt: string; timezone: string; venue?: { name: string; city?: string | null } | null; org: { name: string } }
}

interface OrderRow {
  reference: string
  status: string
  kind: string
  totalMinor: number
  createdAt: string
  event: { title: string; slug: string }
  items: { qty: number; ticketType: { name: string } }[]
}

interface SavedRow {
  kind: string
  event: { id: string; slug: string; title: string; coverImageUrl?: string | null; startsAt: string; city?: string | null; status: string }
}

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  readAt?: string | null
  createdAt: string
}

export default function Me({ route }: { route: Route }) {
  const { user, memberships, unread, setUnread, booted } = usePortal()
  const { toast } = useToast()
  const [tab, setTab] = useState(route.query.get('tab') ?? 'tickets')
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [saved, setSaved] = useState<SavedRow[] | null>(null)
  const [following, setFollowing] = useState<{ orgId: string; org: { name: string; slug: string } }[] | null>(null)
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<{ row: TicketRow; qrSvg: string; qrPayload: string; offlineCopy?: boolean; savedAt?: string } | null>(null)
  const [ticketsOffline, setTicketsOffline] = useState(false)
  const [transferUrl, setTransferUrl] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [profile, setProfile] = useState({ displayName: '', phone: '', city: '', bio: '' })
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [elevated, setElevated] = useState(false)
  const [elevPassword, setElevPassword] = useState('')

  useEffect(() => {
    if (!booted) return // session check still in flight — do not bounce yet
    if (!user) {
      navigate('/signin')
      return
    }
    setProfile({ displayName: user.displayName, phone: user.phone ?? '', city: user.city ?? '', bio: '' })
    setPrefs({ email: true, push: true, sms: Boolean(user.phone), marketing: Boolean(user.notifPrefs?.marketing) })
  }, [user, booted])

  const loadTickets = useCallback(async () => {
    const data = await api.get<{ items: TicketRow[] }>('/tickets').catch(() => null)
    if (data) {
      setTickets(data.items)
      setTicketsOffline(false)
      // Persist the wallet list — the offline baseline for My Tickets.
      cacheTicketList(data.items as unknown as CachedTicketRow[])
      return
    }
    // Network failed: fall back honestly to the last saved wallet.
    const cached = readCachedTicketList()
    if (cached && cached.rows.length > 0) {
      setTickets(cached.rows as unknown as TicketRow[])
      setTicketsOffline(true)
    } else {
      setTickets([])
      setTicketsOffline(false)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    const data = await api.get<{ items: OrderRow[] }>('/orders').catch(() => ({ items: [] }))
    setOrders(data.items)
  }, [])

  const loadOthers = useCallback(async () => {
    const [savedData, followingData, notifData] = await Promise.all([
      api.get<{ items: SavedRow[] }>('/social/saved').catch(() => ({ items: [] })),
      api.get<{ items: { orgId: string; org: { name: string; slug: string } }[] }>('/social/following').catch(() => ({ items: [] })),
      api.get<{ items: NotificationRow[] }>('/notifications').catch(() => ({ items: [] })),
    ])
    setSaved(savedData.items)
    setFollowing(followingData.items)
    setNotifications(notifData.items)
  }, [])

  useEffect(() => {
    if (!user) return
    if (tab === 'tickets' && tickets === null) void loadTickets()
    if (tab === 'orders' && orders === null) void loadOrders()
    if (['saved', 'following', 'notifications'].includes(tab)) void loadOthers()
  }, [tab, user, tickets, orders, loadTickets, loadOrders, loadOthers])

  const openTicket = async (row: TicketRow) => {
    try {
      const detail = await api.get<{ ticket: TicketRow & { qrSvg: string; qrPayload: string } }>(`/tickets/${row.id}`)
      setSelectedTicket({ row: detail.ticket, qrSvg: detail.ticket.qrSvg, qrPayload: detail.ticket.qrPayload, offlineCopy: false })
      setTransferUrl(null)
      setCopiedCode(false)
      // Saved the moment it is seen — this exact QR stays scannable offline.
      cacheTicketDetail({ row: detail.ticket as unknown as CachedTicketRow, qrSvg: detail.ticket.qrSvg, qrPayload: detail.ticket.qrPayload })
    } catch {
      // Offline (or the API died): serve the saved copy if this ticket was opened before.
      const cached: CachedTicketDetail | null = readCachedTicketDetail(row.id)
      if (cached) {
        setSelectedTicket({ row: cached.row as TicketRow, qrSvg: cached.qrSvg, qrPayload: cached.qrPayload, offlineCopy: true, savedAt: cached.savedAt })
        setTransferUrl(null)
        setCopiedCode(false)
        return
      }
      toast({ description: 'Could not load the ticket — you are offline and this ticket has no saved copy yet. Open it once while connected to save it.', variant: 'destructive' })
    }
  }

  const createTransfer = async () => {
    if (!selectedTicket) return
    try {
      const result = await api.post<{ transferToken: string; claimUrl: string }>(`/tickets/${selectedTicket.row.id}`, { action: 'transfer' })
      setTransferUrl(`${window.location.origin}${result.claimUrl}`)
      await navigator.clipboard.writeText(`${window.location.origin}${result.claimUrl}`).catch(() => {})
      toast({ title: 'Transfer link ready', description: 'Copied to clipboard — the recipient claims it once.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not create the transfer.', variant: 'destructive' })
    }
  }

  const markAllRead = async () => {
    await api.post('/notifications', { all: true }).catch(() => {})
    setNotifications((n) => (n ?? []).map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })))
    setUnread(0)
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await api.post('/auth/profile', { displayName: profile.displayName, phone: profile.phone || null, city: profile.city || null, bio: profile.bio, notifPrefs: prefs })
      await api.post('/messages/consent', { channel: 'SMS', grant: prefs.marketing }).catch(() => {})
      toast({ title: 'Profile saved', description: prefs.marketing ? undefined : 'Marketing SMS unsubscribed.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not save the profile.', variant: 'destructive' })
    } finally {
      setSavingProfile(false)
    }
  }

  const doElevate = async () => {
    try {
      await api.post('/auth/elevate', { password: elevPassword })
      setElevated(true)
      setElevPassword('')
      toast({ title: 'Privileged access confirmed', description: 'Financial actions are unlocked for 10 minutes.' })
    } catch {
      toast({ description: 'Incorrect password.', variant: 'destructive' })
    }
  }

  if (!user) return null

  const navTrigger = (active: boolean) =>
    `efx-underline-slide-nav__link flex-none rounded-none border-0 bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-transparent${active ? ' efx-underline-slide-nav__link--active' : ''}`

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-extrabold text-primary">{initials(user.displayName)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{user.displayName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}{user.city ? ` · ${user.city}` : ''}{memberships.length > 0 ? ` · Organizer (${memberships.length})` : ''}</p>
        </div>
        {memberships.length > 0 && (
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/organizer')}>Organizer workspace</Button>
        )}
        {/* R23: every signed-in account can organize — the header previously only
            surfaced the workspace to existing organizers, leaving attendees with
            the single Discover promo band as their only entry point. */}
        {memberships.length === 0 && (
          <Button className="rounded-full ievx-press" onClick={() => navigate('/create-org')}>
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> Start organizing
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          className="efx-underline-slide-nav h-auto w-full rounded-none border-0 bg-transparent"
          style={{ maxWidth: '100%', margin: 0, justifyContent: 'flex-start', flexWrap: 'wrap', gap: '0.4rem 1.4rem', paddingBottom: '0.75rem' }}
        >
          <TabsTrigger value="tickets" aria-current={tab === 'tickets' ? 'true' : undefined} className={navTrigger(tab === 'tickets')}><Ticket className="h-4 w-4" /> Tickets</TabsTrigger>
          <TabsTrigger value="orders" aria-current={tab === 'orders' ? 'true' : undefined} className={navTrigger(tab === 'orders')}><ShoppingBag className="h-4 w-4" /> Orders</TabsTrigger>
          <TabsTrigger value="saved" aria-current={tab === 'saved' ? 'true' : undefined} className={navTrigger(tab === 'saved')}><Heart className="h-4 w-4" /> Saved</TabsTrigger>
          <TabsTrigger value="following" aria-current={tab === 'following' ? 'true' : undefined} className={navTrigger(tab === 'following')}><UserRound className="h-4 w-4" /> Following</TabsTrigger>
          <TabsTrigger value="notifications" aria-current={tab === 'notifications' ? 'true' : undefined} className={navTrigger(tab === 'notifications')}>
            <Bell className="h-4 w-4" /> Notifications {unread > 0 && <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="profile" aria-current={tab === 'profile' ? 'true' : undefined} className={navTrigger(tab === 'profile')}>Profile</TabsTrigger>
        </TabsList>

        {/* Tickets */}
        <TabsContent value="tickets" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Your QR tickets — every ticket you open stays scannable offline.</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void loadTickets()}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh</Button>
          </div>
          {ticketsOffline && (
            <p role="status" className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
              Offline — showing your saved tickets.
            </p>
          )}
          {tickets === null ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-24 rounded-2xl" />)
          ) : tickets.length === 0 ? (
            <EmptyState title="No tickets yet" description="Your purchases and RSVPs will appear here with their QR codes." action={<Button className="rounded-full" onClick={() => navigate('/')}>Discover events</Button>} />
          ) : (
            tickets.map((t) => (
              <button key={t.id} className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 text-left ievx-card-hover" onClick={() => void openTicket(t)}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Ticket className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.event.title}</p>
                  <p className="text-xs text-muted-foreground">{t.ticketType.name} · {dateLong(t.event.startsAt, t.event.timezone)}</p>
                  <p className="text-xs text-muted-foreground">{t.event.venue?.name ?? 'Online'} · <span className="font-mono">{t.code}</span></p>
                </div>
                <Badge variant={t.status === 'VALID' ? 'default' : 'secondary'} className="relative shrink-0 overflow-visible capitalize">
                  {humanize(t.status)}
                  {t.status === 'VALID' && <span className="efx-badge-ping__ping" aria-hidden />}
                </Badge>
              </button>
            ))
          )}
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="space-y-3">
          {orders === null ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-20 rounded-2xl" />)
          ) : orders.length === 0 ? (
            <EmptyState title="No orders yet" description="When you book an event, your order history lands here." />
          ) : (
            orders.map((o) => (
              <button key={o.reference} className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 text-left ievx-card-hover" onClick={() => navigate(`/order/${o.reference}`)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.event.title}</p>
                  <p className="text-xs text-muted-foreground">{o.items.map((i) => `${i.qty}× ${i.ticketType.name}`).join(', ')}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-mono">{o.reference}</span> · {relative(o.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary">{o.totalMinor === 0 ? 'Free' : money(o.totalMinor)}</p>
                  <Badge variant={statusTone(o.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(o.status)}</Badge>
                </div>
              </button>
            ))
          )}
        </TabsContent>

        {/* Saved */}
        <TabsContent value="saved" className="space-y-3">
          {saved === null ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-16 rounded-xl" />)
          ) : saved.length === 0 ? (
            <EmptyState title="Nothing saved yet" description="Tap the bookmark on any event to keep it here." />
          ) : (
            saved.map((s, i) => (
              <button key={i} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left ievx-card-hover" onClick={() => navigate(`/event/${s.event.slug}`)}>
                {s.event.coverImageUrl ? (
                  <img src={s.event.coverImageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                ) : <div className="h-12 w-12 rounded-lg bg-secondary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.event.title}</p>
                  <p className="text-xs text-muted-foreground">{dateLong(s.event.startsAt)}{s.event.city ? ` · ${s.event.city}` : ''}</p>
                </div>
                <Badge variant="secondary" className="capitalize text-[10px]">{humanize(s.kind)}</Badge>
              </button>
            ))
          )}
        </TabsContent>

        {/* Following */}
        <TabsContent value="following" className="space-y-3">
          {following === null ? (
            Array.from({ length: 2 }).map((_, i) => <div key={i} className="ievx-skeleton h-16 rounded-xl" />)
          ) : following.length === 0 ? (
            <EmptyState title="Not following anyone yet" description="Follow organizers to build a personalized feed." />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Your personalized feed blends followed organizers with featured picks.</p>
              {following.map((f) => (
                <button key={f.orgId} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left ievx-card-hover" onClick={() => navigate(`/org/${f.org.slug}`)}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{initials(f.org.name)}</span>
                  <p className="flex-1 truncate font-semibold">{f.org.name}</p>
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={(e) => { e.stopPropagation(); navigate('/social/feed') }}>View feed</Button>
                </button>
              ))}
            </>
          )}
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{unread} unread</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void markAllRead()} disabled={unread === 0}><Check className="mr-1 h-3.5 w-3.5" /> Mark all read</Button>
          </div>
          {notifications === null ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton h-16 rounded-xl" />)
          ) : notifications.length === 0 ? (
            <EmptyState title="No notifications" description="Ticket receipts, reminders and live alerts will arrive here." />
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={`flex w-full gap-3 rounded-xl border p-4 text-left transition-colors ${n.readAt ? 'border-border/50 bg-card' : 'border-primary/30 bg-primary/5'}`}
                onClick={async () => {
                  if (!n.readAt) {
                    await api.post('/notifications', { id: n.id }).catch(() => {})
                    setNotifications((list) => (list ?? []).map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)))
                    setUnread(Math.max(0, unread - 1))
                  }
                  if (n.link) navigate(n.link.replace(/^#/, ''))
                }}
              >
                {n.readAt ? (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden />
                ) : (
                  <span className="efx-badge-ping__dot shrink-0" style={{ position: 'static', width: '8px', height: '8px', marginTop: '4px' }} aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{relative(n.createdAt)} · {humanize(n.type)}</p>
                </div>
              </button>
            ))
          )}
        </TabsContent>

        {/* Profile */}
        <TabsContent value="profile">
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-base">Profile & preferences</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input id="displayName" value={profile.displayName} onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+233 …" inputMode="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <p className="rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-muted-foreground">{user.email} · {humanize(user.role)} · {user.timezone}</p>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-semibold">Notifications</p>
                {[
                  { key: 'email', label: 'Email notifications', desc: 'Receipts, reminders and account emails' },
                  { key: 'sms', label: 'Transactional SMS', desc: 'Ticket access and critical updates to your phone' },
                  { key: 'marketing', label: 'Marketing SMS', desc: 'Offers and event suggestions (unsubscribe anytime)' },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.desc}</p>
                    </div>
                    <Switch checked={Boolean(prefs[row.key])} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [row.key]: v }))} aria-label={row.label} />
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-800">Security</p>
                <p className="text-xs text-muted-foreground">Privileged actions (payouts, refunds) require a recent password confirmation.</p>
                {!elevated && !user.elevated ? (
                  <div className="flex gap-2">
                    <Input type="password" value={elevPassword} onChange={(e) => setElevPassword(e.target.value)} placeholder="Current password" aria-label="Current password" className="max-w-56" />
                    <Button variant="outline" className="rounded-full" onClick={() => void doElevate()}>Confirm identity</Button>
                  </div>
                ) : (
                  <Badge className="w-fit gap-1 bg-primary text-primary-foreground"><Check className="h-3 w-3" /> Privileged access active (10 min)</Badge>
                )}
              </div>
              <Button className="rounded-full ievx-press" onClick={() => void saveProfile()} disabled={savingProfile}>
                {savingProfile && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />} Save changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Ticket QR dialog */}
      <Dialog open={Boolean(selectedTicket)} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-sm">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">{selectedTicket.row.event.title}</DialogTitle>
              </DialogHeader>
              {selectedTicket.offlineCopy && (
                <p role="status" className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  Offline copy{selectedTicket.savedAt ? ` · saved ${relative(selectedTicket.savedAt)}` : ''}
                </p>
              )}
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-2xl border-8 border-white bg-white shadow-lg" dangerouslySetInnerHTML={{ __html: selectedTicket.qrSvg }} aria-label="Ticket QR code" role="img" />
                <div>
                  <p className="font-mono text-sm font-bold tracking-wider">{selectedTicket.row.code}</p>
                  <p className="text-xs text-muted-foreground">{selectedTicket.row.ticketType.name} · {dateLong(selectedTicket.row.event.startsAt, selectedTicket.row.event.timezone)}</p>
                  <p className="text-xs text-muted-foreground">{selectedTicket.row.event.venue?.name ?? 'Online'} · {selectedTicket.row.event.org.name}</p>
                </div>
                <label
                  className="efx-copy-success-checkmark cursor-pointer"
                  style={{ margin: '0.25rem 0 0' }}
                  onClick={() => {
                    if (selectedTicket && !copiedCode) {
                      void navigator.clipboard.writeText(selectedTicket.row.code).catch(() => {})
                      setCopiedCode(true)
                    }
                  }}
                >
                  <input type="checkbox" className="efx-copy-success-checkmark__input" checked={copiedCode} onChange={() => {}} aria-label="Copy ticket reference" />
                  <span className="efx-copy-success-checkmark__button">
                    <span className="efx-copy-success-checkmark__badge" aria-hidden="true">
                      <svg className="efx-copy-success-checkmark__icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path className="efx-copy-success-checkmark__path" d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    </span>
                    <span className="efx-copy-success-checkmark__text">
                      <span className="efx-copy-success-checkmark__text-copy">Copy ticket ref</span>
                      <span className="efx-copy-success-checkmark__text-done">Copied!</span>
                    </span>
                  </span>
                </label>
                <Badge variant={selectedTicket.row.status === 'VALID' ? 'default' : 'secondary'} className="capitalize">{humanize(selectedTicket.row.status)}</Badge>
                {selectedTicket.row.status === 'VALID' ? (
                  <Button variant="outline" className="w-full rounded-full" onClick={() => void createTransfer()}>
                    <Share2 className="mr-1.5 h-4 w-4" /> Transfer this ticket
                  </Button>
                ) : null}
                {transferUrl && (
                  <div className="w-full rounded-xl bg-secondary/60 p-3 text-left">
                    <p className="text-xs font-semibold">One-time claim link (copied):</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-primary">{transferUrl}</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">The QR carries no personal data — only an opaque code with an HMAC signature.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
