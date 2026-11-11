'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck, Users, Building2, CalendarDays, Flag, Percent, CreditCard, Wallet, RotateCw, Bell, ScrollText, Plug, Settings2, Landmark, Loader2, Check, X, Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate, type Route } from '../router'
import { usePortal, isPlatformStaff } from '../store'
import { money, relative, humanize, statusTone } from '../format'
import { EmptyState } from '../components/EventCard'

const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: ShieldCheck },
  { key: 'orgs', label: 'Organizations', icon: Building2 },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'moderation', label: 'Moderation', icon: Flag },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'refunds', label: 'Refunds', icon: RotateCw },
  { key: 'payouts', label: 'Payouts', icon: Landmark },
  { key: 'fees', label: 'Fees & Plans', icon: Percent },
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'sms', label: 'SMS Log', icon: Bell },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
  { key: 'sweeps', label: 'Operations', icon: Settings2 },
]

export default function AdminConsole({ route }: { route: Route }) {
  const { user } = usePortal()
  const [section, setSection] = useState(route.query.get('tab') ?? 'overview')

  useEffect(() => {
    if (!user) {
      navigate('/signin')
      return
    }
    if (!isPlatformStaff(user)) navigate('/')
  }, [user])

  if (!user || !isPlatformStaff(user)) return null

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="text-xl font-extrabold">Platform Administration</h1>
          <p className="text-xs text-muted-foreground">{humanize(user.role)} · actions are audited · privileged finance requires re-authentication</p>
        </div>
      </div>

      <div className="ievx-scrollbar mb-5 flex gap-1.5 overflow-x-auto rounded-2xl bg-secondary/60 p-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              section === s.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-current={section === s.key ? 'page' : undefined}
          >
            <s.icon className="h-4 w-4" aria-hidden />
            {s.label}
          </button>
        ))}
      </div>

      <div key={section} className="ievx-view-enter">
        {section === 'overview' && <Overview />}
        {section === 'orgs' && <Orgs />}
        {section === 'events' && <EventsAdmin />}
        {section === 'moderation' && <Moderation />}
        {section === 'payments' && <Payments />}
        {section === 'refunds' && <Refunds />}
        {section === 'payouts' && <Payouts />}
        {section === 'fees' && <FeesPlans />}
        {section === 'integrations' && <Integrations />}
        {section === 'sms' && <SmsLog />}
        {section === 'audit' && <AuditLog />}
        {section === 'sweeps' && <Sweeps />}
      </div>
    </div>
  )
}

function useAdmin<T>(path: string): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api.get<T>(path))
    } catch {
      setData(null)
    }
  }, [path])
  useEffect(() => {
    void load()
  }, [load])
  return [data, load]
}

function StatGrid({ stats }: { stats: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="rounded-2xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-xl font-extrabold ${s.tone ?? ''}`}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Overview() {
  const [data] = useAdmin<{
    counts: Record<string, number>
    grossVolumeMinor: number
    platformRevenueMinor: number
    orderStatuses: { status: string; _count: number }[]
  }>('/admin/overview')

  if (!data) return <EmptyState title="Overview unavailable" description="You may lack the required platform role." />
  return (
    <div className="space-y-5">
      <StatGrid
        stats={[
          { label: 'Users', value: data.counts.users.toLocaleString() },
          { label: 'Organizations', value: data.counts.orgs.toLocaleString() },
          { label: 'Events', value: data.counts.events.toLocaleString() },
          { label: 'Tickets issued', value: data.counts.tickets.toLocaleString() },
          { label: 'Gross ticket volume', value: money(data.grossVolumeMinor) },
          { label: 'Platform revenue (fees)', value: money(data.platformRevenueMinor), tone: 'text-primary' },
          { label: 'Payouts pending', value: String(data.counts.payoutsPending), tone: 'text-amber-600' },
          { label: 'Payment exceptions', value: String(data.counts.paymentExceptions), tone: 'text-destructive' },
        ]}
      />
      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Order pipeline</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.orderStatuses.map((o) => (
            <Badge key={o.status} variant={statusTone(o.status) === 'success' ? 'default' : 'secondary'} className="capitalize gap-1">
              {humanize(o.status)} <span className="font-bold">{o._count}</span>
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Orgs() {
  const { toast } = useToast()
  const [data, reload] = useAdmin<{ items: { id: string; name: string; slug: string; status: string; city?: string | null; verifiedAt?: string | null; verification?: { status: string } | null; _count: { events: number } }[] }>('/admin/orgs')

  const verify = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await api.post(`/admin/orgs/${id}/verify`, { decision, notes: decision === 'APPROVE' ? 'Documents verified by platform finance.' : 'Documents insufficient.' })
      toast({ title: `Organization ${decision === 'APPROVE' ? 'verified' : 'rejected'}` })
      reload()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
    }
  }

  if (!data) return <EmptyState title="Organizations unavailable" />
  return (
    <div className="space-y-3">
      {data.items.map((o) => (
        <Card key={o.id} className="rounded-2xl">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{o.name}</p>
                <Badge variant={o.status === 'ACTIVE' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(o.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{o.city ?? '—'} · {o._count.events} events · /{o.slug}</p>
            </div>
            {o.status !== 'ACTIVE' && o.verification?.status !== 'APPROVED' && (
              <div className="flex gap-1.5">
                <Button size="sm" className="rounded-full" onClick={() => void verify(o.id, 'APPROVE')}><Check className="mr-1 h-3.5 w-3.5" /> Approve</Button>
                <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => void verify(o.id, 'REJECT')}><X className="mr-1 h-3.5 w-3.5" /> Reject</Button>
              </div>
            )}
            {o.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={async () => { await api.post(`/admin/orgs/${o.id}/suspend`, {}); reload() }}>Suspend</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EventsAdmin() {
  const { toast } = useToast()
  const [data, reload] = useAdmin<{ items: { id: string; title: string; slug: string; status: string; visibility: string; org: { name: string }; _count: { tickets: number } }[] }>('/admin/events')

  const suspend = async (id: string) => {
    await api.post(`/admin/events/${id}/suspend`, { reason: 'Suspended by platform moderation.' }).catch(() => {})
    toast({ title: 'Event suspended', description: 'Ticket holders are notified; financial history preserved.' })
    reload()
  }

  if (!data) return <EmptyState title="Events unavailable" />
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="p-3">Event</th><th className="p-3">Organizer</th><th className="p-3">Status</th><th className="p-3">Visibility</th><th className="p-3">Tickets</th><th className="p-3" /></tr>
        </thead>
        <tbody>
          {data.items.map((e) => (
            <tr key={e.id} className="border-t border-border/50 hover:bg-secondary/30">
              <td className="p-3"><button className="font-medium hover:text-primary" onClick={() => navigate(`/event/${e.slug}`)}>{e.title}</button></td>
              <td className="p-3 text-xs">{e.org.name}</td>
              <td className="p-3"><Badge variant={statusTone(e.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(e.status)}</Badge></td>
              <td className="p-3 text-xs">{humanize(e.visibility)}</td>
              <td className="p-3">{e._count.tickets}</td>
              <td className="p-3">
                {['PUBLISHED', 'LIVE', 'SCHEDULED'].includes(e.status) && (
                  <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => void suspend(e.id)}>Suspend</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Moderation() {
  const { toast } = useToast()
  const [data, reload] = useAdmin<{ items: { id: string; targetType: string; targetId: string; reason: string; details?: string | null; status: string; createdAt: string; reporter?: { displayName: string; email: string } | null }[] }>('/admin/moderation')

  const action = async (id: string, act: string) => {
    try {
      await api.post(`/admin/moderation/${id}/action`, { action: act })
      toast({ title: `Report ${act === 'DISMISS' ? 'dismissed' : 'actioned'}` })
      reload()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
    }
  }

  if (!data || data.items.length === 0) return <EmptyState title="No open reports" description="User reports on events, comments and broadcasts land here." />
  return (
    <div className="space-y-3">
      {data.items.map((r) => (
        <Card key={r.id} className="rounded-2xl">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">{humanize(r.targetType)}</Badge>
              <Badge variant="secondary" className="capitalize">{humanize(r.reason)}</Badge>
              <span className="text-xs text-muted-foreground">{relative(r.createdAt)} · by {r.reporter?.displayName ?? 'anonymous'}</span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">target: {r.targetId}</p>
            {r.details && <p className="text-sm">{r.details}</p>}
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void action(r.id, 'REMOVE_CONTENT')}>Remove content</Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => void action(r.id, 'SUSPEND_USER')}>Suspend user</Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void action(r.id, 'DISMISS')}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Payments() {
  const { toast } = useToast()
  const [data, reload] = useAdmin<{
    items: { id: string; reference: string; status: string; provider: string; amountMinor: number; callbackCount: number; reconcileCheckCount: number; initiatedAt: string; failureReason?: string | null; order?: { reference: string; status: string; buyerEmail: string } | null }[]
    providerEvents: { id: string; reference?: string | null; status: string; receivedAt: string; errorNote?: string | null }[]
  }>('/admin/payments')

  const reconcile = async () => {
    try {
      const result = await api.post<{ sweep: string; result: unknown }>('/admin/sweeps/reconcile')
      toast({ title: 'Reconciliation sweep executed', description: JSON.stringify(result.result).slice(0, 140) })
      reload()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Sweep failed.', variant: 'destructive' })
    }
  }

  if (!data) return <EmptyState title="Payments unavailable" description="Finance administrator role required." />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.items.length} recent attempts · callbacks durable + deduplicated · ≥5-min reconciliation rule</p>
        <Button variant="outline" className="rounded-full" onClick={() => void reconcile()}><RotateCw className="mr-1.5 h-4 w-4" /> Run reconciliation now</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Reference</th><th className="p-3">Order</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Callbacks</th><th className="p-3">Reconcile</th><th className="p-3">Initiated</th></tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id} className="border-t border-border/50 hover:bg-secondary/30">
                <td className="p-3 font-mono text-xs">{a.reference}</td>
                <td className="p-3 text-xs">{a.order?.reference ?? '—'}<br /><span className="text-muted-foreground">{a.order?.buyerEmail}</span></td>
                <td className="p-3 font-semibold">{money(a.amountMinor)}</td>
                <td className="p-3">
                  <Badge variant={statusTone(a.status) === 'success' ? 'default' : a.status === 'UNKNOWN' || a.status === 'FAILED' ? 'destructive' : 'secondary'} className="capitalize text-[10px]">{humanize(a.status)}</Badge>
                  {a.failureReason && <p className="mt-1 max-w-52 text-[10px] text-destructive">{a.failureReason}</p>}
                </td>
                <td className="p-3 text-xs">{a.callbackCount}</td>
                <td className="p-3 text-xs">{a.reconcileCheckCount} checks</td>
                <td className="p-3 text-xs text-muted-foreground">{relative(a.initiatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Provider events (redacted)</CardTitle></CardHeader>
        <CardContent className="max-h-64 space-y-1.5 overflow-y-auto ievx-scrollbar">
          {data.providerEvents.map((pe) => (
            <div key={pe.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
              <span className="font-mono">{pe.reference ?? '—'}</span>
              <span className="flex items-center gap-2">
                <Badge variant={pe.status === 'PROCESSED' ? 'default' : pe.status === 'DUPLICATE' ? 'secondary' : 'destructive'} className="text-[9px] capitalize">{humanize(pe.status)}</Badge>
                <span className="text-muted-foreground">{relative(pe.receivedAt)}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Refunds() {
  const { toast } = useToast()
  const [elevPassword, setElevPassword] = useState('')
  const [data, reload] = useAdmin<{ items: { id: string; type: string; status: string; amountMinor: number; reason: string; createdAt: string; order: { reference: string; status: string; totalMinor: number; event?: { title: string } | null } }[] }>('/admin/refunds')

  const act = async (id: string, op: 'approve' | 'process' | 'reject') => {
    try {
      const result = await api.post<{ status: string }>(`/admin/refunds/${id}/${op}`, op === 'process' ? {} : { note: 'Platform finance decision.' })
      toast({ title: `Refund ${op === 'process' ? 'processed' : op}`, description: `Outcome: ${humanize(result.status ?? 'OK')} · ledger reversed, unused tickets revoked.` })
      reload()
    } catch (err) {
      if (err instanceof ApiClientError && err.extra && (err.extra as { elevated?: boolean }).elevated) {
        toast({ title: 'Password confirmation required', description: 'Open My Account → Profile → Security, confirm your password, then retry within 10 minutes.', variant: 'destructive' })
      } else {
        toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
      }
    }
  }

  if (!data) return <EmptyState title="Refunds unavailable" description="Finance administrator role required." />
  return (
    <div className="space-y-3">
      <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-xs text-amber-800">
          Processing a refund is a privileged financial action: confirm your password first (Profile → Security → Confirm identity). Hubtel supports full-order MoMo refunds;
          unsupported/partial paths remain tracked MANUAL cases — an internal status is never shown as money movement.
        </CardContent>
      </Card>
      {data.items.length === 0 && <EmptyState title="No refund cases" />}
      {data.items.map((rc) => (
        <Card key={rc.id} className="rounded-2xl">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{rc.order.reference}</span>
                <Badge variant={statusTone(rc.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(rc.status)}</Badge>
                <Badge variant="outline" className="text-[10px]">{rc.type === 'FULL' ? 'Full order' : rc.type === 'PARTIAL' ? 'Partial' : 'Manual only'}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{rc.order.event?.title ?? ''} · {money(rc.amountMinor)} · {rc.reason}</p>
              <p className="text-xs text-muted-foreground">Opened {relative(rc.createdAt)}</p>
            </div>
            <div className="flex gap-1.5">
              {rc.status === 'REQUESTED' && (
                <>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => void act(rc.id, 'approve')}>Approve</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void act(rc.id, 'reject')}>Reject</Button>
                </>
              )}
              {rc.status === 'APPROVED' && (
                <Button size="sm" className="rounded-full" onClick={() => void act(rc.id, 'process')}><Play className="mr-1 h-3.5 w-3.5" /> Process refund</Button>
              )}
              {rc.status === 'MANUAL_TRACKED' && <Badge variant="secondary">Manual resolution with evidence</Badge>}
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="max-w-56"><Input type="password" value={elevPassword} onChange={(e) => setElevPassword(e.target.value)} placeholder="(helper) current password" aria-label="Current password" className="hidden" /></div>
    </div>
  )
}

function Payouts() {
  const { toast } = useToast()
  const [data, reload] = useAdmin<{ items: { id: string; amountMinor: number; status: string; createdAt: string; org: { name: string }; failureReason?: string | null; providerRef?: string | null }[] }>('/admin/payouts')

  const act = async (id: string, op: string) => {
    try {
      const result = await api.post<{ submitted?: boolean; error?: string }>(`/admin/payouts/${id}/${op}`)
      toast({ title: `Payout ${op}`, description: result.error ?? 'Ledger updated; in-flight hold managed.' })
      reload()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
    }
  }

  if (!data) return <EmptyState title="Payouts unavailable" description="Finance administrator role required." />
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Provider submission requires Hubtel Send Money credentials + merchant agreement (currently blocked — see Integrations). Requested → Approved → Submitted → Paid;
        a failed payout reverses the ledger and retries with the SAME reference, never a fresh one.
      </p>
      {data.items.length === 0 && <EmptyState title="No payouts" />}
      {data.items.map((p) => (
        <Card key={p.id} className="rounded-2xl">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold">{money(p.amountMinor)}</p>
                <Badge variant={statusTone(p.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(p.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{p.org.name} · requested {relative(p.createdAt)}{p.providerRef ? ` · ${p.providerRef}` : ''}</p>
              {p.failureReason && <p className="mt-1 max-w-md text-[11px] text-amber-700">{p.failureReason}</p>}
            </div>
            <div className="flex gap-1.5">
              {p.status === 'REQUESTED' && <Button size="sm" className="rounded-full" onClick={() => void act(p.id, 'approve')}>Approve</Button>}
              {p.status === 'APPROVED' && <Button size="sm" variant="outline" className="rounded-full" onClick={() => void act(p.id, 'submit')}>Submit to provider</Button>}
              {p.status === 'SUBMITTED' && (
                <>
                  <Button size="sm" className="rounded-full" onClick={() => void act(p.id, 'paid')}>Mark paid</Button>
                  <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => void act(p.id, 'fail')}>Mark failed</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FeesPlans() {
  const { toast } = useToast()
  const [fees, reloadFees] = useAdmin<{ items: { id: string; version: number; name: string; ticketCommissionPct: number; processingFeePct: number; smsRateMinor: number; active: boolean }[] }>('/admin/fees')
  const [plans, reloadPlans] = useAdmin<{ items: { id: string; code: string; name: string; priceMinor: number; billingPeriodDays: number; entitlements: string }[] }>('/admin/plans')
  const [newFee, setNewFee] = useState({ name: '', commission: '5.00', processing: '1.95' })

  const createFee = async () => {
    try {
      await api.post('/admin/fees', {
        name: newFee.name || undefined,
        ticketCommissionPct: Math.round(Number(newFee.commission) * 100),
        processingFeePct: Math.round(Number(newFee.processing) * 100),
      })
      toast({ title: 'New fee version active', description: 'Existing orders keep their immutable snapshots.' })
      setNewFee({ name: '', commission: '5.00', processing: '1.95' })
      reloadFees()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Failed.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Fee versions (snapshot at purchase)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fees?.items.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
              <span>v{f.version} · {f.name}</span>
              <span className="text-xs text-muted-foreground">
                commission {(f.ticketCommissionPct / 100).toFixed(2)}% · processing {(f.processingFeePct / 100).toFixed(2)}% · SMS {money(f.smsRateMinor)}/segment
              </span>
              {f.active && <Badge>Active</Badge>}
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto] pt-1">
            <Input value={newFee.name} onChange={(e) => setNewFee((f) => ({ ...f, name: e.target.value }))} placeholder="Version name" aria-label="Fee version name" />
            <Input value={newFee.commission} onChange={(e) => setNewFee((f) => ({ ...f, commission: e.target.value }))} placeholder="Commission %" inputMode="decimal" aria-label="Commission percent" />
            <Input value={newFee.processing} onChange={(e) => setNewFee((f) => ({ ...f, processing: e.target.value }))} placeholder="Processing %" inputMode="decimal" aria-label="Processing percent" />
            <Button className="rounded-full" onClick={() => void createFee()}>Publish version</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Subscription plans (editable dev labels)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {plans?.items.map((p) => (
            <div key={p.id} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name} ({p.code})</span>
                <span className="font-bold text-primary">{p.priceMinor === 0 ? 'Free' : money(p.priceMinor)}/{p.billingPeriodDays}d</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.entitlements}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Integrations() {
  const [data] = useAdmin<{ integrations: { key: string; name: string; stage: string; configured: boolean; mode: string; detail: string }[]; validation: { errors: string[]; warnings: string[] } }>('/admin/integrations')

  if (!data) return <EmptyState title="Integration health unavailable" />
  return (
    <div className="space-y-4">
      {data.validation.warnings.length > 0 && (
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-xs text-amber-800">
            <p className="font-bold">Configuration warnings</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {data.validation.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.integrations.map((i) => (
          <Card key={i.key} className="rounded-2xl">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{i.name}</p>
                <Badge variant={i.mode === 'real' ? 'default' : i.mode === 'simulated' ? 'secondary' : 'outline'} className="capitalize">{i.mode}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{i.detail}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">stage: {i.stage.replace('-', ' ')} · {i.configured ? 'credentials present' : 'credentials missing'}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SmsLog() {
  const [data] = useAdmin<{ items: { id: string; channel: string; target: string; status: string; provider: string; purpose: string; segmentsCount?: number | null; createdAt: string; failureReason?: string | null }[]; mode: string }>('/admin/sms')

  if (!data) return <EmptyState title="SMS log unavailable" />
  return (
    <div className="space-y-3">
      <Badge variant={data.mode === 'real' ? 'default' : 'secondary'}>{data.mode === 'real' ? 'Hubtel SMS active' : 'Dev simulator — no live messages'}</Badge>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Target</th><th className="p-3">Purpose</th><th className="p-3">Status</th><th className="p-3">Provider</th><th className="p-3">Segments</th><th className="p-3">When</th></tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.id} className="border-t border-border/50 hover:bg-secondary/30">
                <td className="p-3 font-mono text-xs">{m.target}</td>
                <td className="p-3 text-xs capitalize">{humanize(m.purpose)}</td>
                <td className="p-3"><Badge variant={statusTone(m.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[10px]">{humanize(m.status)}</Badge>{m.failureReason && <p className="text-[10px] text-destructive">{m.failureReason}</p>}</td>
                <td className="p-3 text-xs">{m.provider}</td>
                <td className="p-3 text-xs">{m.segmentsCount ?? '—'}</td>
                <td className="p-3 text-xs text-muted-foreground">{relative(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">API acceptance ≠ handset delivery — provider delivery states drive DELIVERED/FAILED only.</p>
    </div>
  )
}

function AuditLog() {
  const [data] = useAdmin<{ items: { id: string; actorLabel: string; action: string; entityType: string; entityId: string; createdAt: string }[] }>('/admin/audit')

  if (!data) return <EmptyState title="Audit log unavailable" />
  return (
    <div className="space-y-1.5">
      {data.items.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
          <Badge variant="outline" className="text-[9px]">{a.action}</Badge>
          <span className="font-medium">{a.actorLabel}</span>
          <span className="text-muted-foreground">→ {a.entityType} {a.entityId.slice(0, 10)}…</span>
          <span className="ml-auto text-muted-foreground">{relative(a.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}

function Sweeps() {
  const { toast } = useToast()
  const [busy, setBusy] = useState('')

  const run = async (kind: string) => {
    setBusy(kind)
    try {
      const result = await api.post<{ sweep: string; result: unknown }>(`/admin/sweeps/${kind}`)
      toast({ title: `${humanize(kind)} sweep complete`, description: JSON.stringify(result.result).slice(0, 160) })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Sweep failed.', variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  const sweeps = [
    { key: 'reconcile', label: 'Payment reconciliation', desc: '≥5-min status checks with bounded retries; unresolved → UNKNOWN in the ops queue.' },
    { key: 'reservations', label: 'Release expired holds', desc: 'Frees inventory from abandoned checkouts; never touches paid orders.' },
    { key: 'lifecycle', label: 'Event lifecycle', desc: 'Scheduled publishes, auto-end, promotion schedule transitions.' },
    { key: 'reminders', label: 'Send 24h reminders', desc: 'Idempotent per event/day via markers.' },
    { key: 'sms', label: 'SMS delivery poll', desc: 'ACCEPTED → DELIVERED/FAILED only from provider states (simulator: labelled).' },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">The worker (:3001) runs these continuously. Run them manually to verify behaviour instantly.</p>
      {sweeps.map((s) => (
        <Card key={s.key} className="rounded-2xl">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
            <Button variant="outline" className="rounded-full" disabled={busy === s.key} onClick={() => void run(s.key)}>
              {busy === s.key && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />} Run now
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
