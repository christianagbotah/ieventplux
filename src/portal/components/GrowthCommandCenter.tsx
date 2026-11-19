'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCheck, ChartNoAxesCombined, ClipboardList, ClipboardCopy, Megaphone, RefreshCw, ShieldCheck, Sparkles, TicketCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'

type GrowthPriority = 'critical' | 'high' | 'opportunity' | 'info'
type GrowthOpportunity = {
  id: string
  eventId: string
  eventTitle: string
  eventSlug: string
  title: string
  detail: string
  priority: GrowthPriority
  action: 'events' | 'promotions' | 'attendees' | 'messages'
  actionLabel: string
  evidence: string
}
type GrowthPayload = {
  source: 'rule-based'
  generatedAt: string
  eventsExamined: number
  draftEvents: number
  publishedUpcoming: number
  ticketsIssuedLast7Days: number
  readyToLaunch: number
  actionableItems: number
  opportunities: GrowthOpportunity[]
  note: string
}
const PRIORITY: Record<GrowthPriority, { label: string; className: string }> = {
  critical: { label: 'Fix before launch', className: 'border-rose-300/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  high: { label: 'High priority', className: 'border-amber-300/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  opportunity: { label: 'Opportunity', className: 'border-sky-300/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  info: { label: 'For your attention', className: 'border-border bg-secondary text-muted-foreground' },
}

/** Event operations cockpit — source-labelled, role-scoped and backed by real rows.
 * Rule-based recommendations do not imply an ML forecast or paid promotion ROI.
 */
export function GrowthCommandCenter({ orgId, compact = false, canCreate = true }: {
  orgId: string
  compact?: boolean
  canCreate?: boolean
}) {
  const { toast } = useToast()
  const [payload, setPayload] = useState<GrowthPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [filter, setFilter] = useState<'all' | 'urgent' | 'opportunities'>('all')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    setError('')
    void api.get<GrowthPayload>(`/orgs/${orgId}/growth`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setPayload(result) })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setPayload(null)
        setError(reason instanceof ApiClientError ? reason.message : 'Your growth insights could not be loaded. Please retry.')
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [orgId, revision])

  const visible = (payload?.opportunities ?? []).filter((item) => filter === 'all' || (filter === 'urgent' ? ['high', 'critical'].includes(item.priority) : item.priority === 'opportunity'))
  const items = compact ? visible.slice(0, 3) : visible
  const urgentCount = payload?.opportunities.filter((item) => ['high', 'critical'].includes(item.priority)).length ?? 0

  const copyPlan = async () => {
    if (!payload) return
    const text = [
      `iEventPlux growth plan · ${new Date(payload.generatedAt).toLocaleDateString()}`,
      'Source: your real event inventory and issued tickets; rule-based, not predictive AI.',
      ...payload.opportunities.map((item, index) => `${index + 1}. [${item.priority.toUpperCase()}] ${item.eventTitle} — ${item.title}. ${item.detail} (${item.evidence})`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Action plan copied', description: 'Share it with your team or save it to your planning notes.' })
    } catch { toast({ title: 'Copy unavailable', description: 'Your browser could not copy the plan.', variant: 'destructive' }) }
  }

  if (busy && !payload) return (
    <div className="space-y-3" aria-label="Loading growth intelligence">
      <div className="ievx-skeleton h-36 rounded-[22px]" />
      <div className="ievx-skeleton h-40 rounded-[18px]" />
    </div>
  )
  if (error) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <div><p className="text-sm font-semibold">Growth intelligence is temporarily unavailable</p><p className="mt-1 text-xs text-muted-foreground">{error}</p></div>
      <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="mr-2 size-4" /> Retry</Button>
    </div>
  )
  if (!payload) return null

  return (
    <section className={compact ? 'space-y-3' : 'space-y-5'} aria-label="Organizer growth intelligence">
      {!compact && (
        <div className="ievx-growth-hero relative overflow-hidden rounded-[22px] p-5 sm:p-7">
          <div className="relative z-10 max-w-3xl">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-200"><Sparkles className="size-3.5" /> iEventPlux Intelligence</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-[32px]">Your next best moves, all in one place.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/85">Prioritized launch, ticketing, waitlist and event-day actions from your real operations. Pair them with the AI advisor for more tailored guidance.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" className="border-0 bg-white text-emerald-950 hover:bg-emerald-50" onClick={() => navigate('/organizer?tab=events')}><CalendarClock className="mr-1.5 size-4" /> Manage events</Button>
              <Button size="sm" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate('/ai-studio')}><Sparkles className="mr-1.5 size-4" /> AI Content Studio</Button>
            </div>
          </div>
        </div>
      )}
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-bold tracking-tight">Growth opportunities</h2><p className="text-xs text-muted-foreground">Next actions from real event data</p></div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/organizer?tab=growth')}>Open Growth Center <ArrowRight className="ml-1 size-4" /></Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Active events reviewed', value: payload.eventsExamined, icon: CalendarClock, desc: 'Upcoming and draft events' },
            { label: 'Launch ready', value: payload.readyToLaunch, icon: ShieldCheck, desc: 'Basic setup complete' },
            { label: 'Tickets · last 7 days', value: payload.ticketsIssuedLast7Days, icon: TicketCheck, desc: 'Valid or checked-in tickets issued' },
            { label: 'Actions identified', value: payload.actionableItems, icon: ChartNoAxesCombined, desc: 'Rules, not sales forecasts' },
          ].map(({ label, value, icon: Icon, desc }) => (
            <div key={label} className="ievx-growth-stat rounded-2xl border border-border/70 bg-card px-3 py-4 sm:px-4">
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{label}</span><Icon className="size-4 shrink-0 text-primary" /></div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value.toLocaleString()}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-border/70 bg-card p-3 sm:p-5">
        {!compact && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="flex items-center gap-2 text-base font-bold"><ClipboardList className="size-4 text-primary" /> Action queue</h3><p className="mt-1 text-xs text-muted-foreground">Your most important operational next steps, sorted by urgency</p></div>
            <div className="flex items-center gap-1.5"><Button size="sm" variant="outline" onClick={() => void copyPlan()}><ClipboardCopy className="mr-1.5 size-3.5" /> Copy plan</Button><Button size="icon" variant="ghost" className="size-8" aria-label="Refresh growth intelligence" onClick={refresh}><RefreshCw className={'size-4 ' + (busy ? 'animate-spin' : '')} /></Button></div>
          </div>
        )}
        {!compact && (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter growth recommendations">
            {(['all', 'urgent', 'opportunities'] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => setFilter(value)}>{value === 'all' ? 'All actions' : value === 'urgent' ? `Urgent · ${urgentCount}` : 'Opportunities'}</Button>)}
          </div>
        )}
        {payload.eventsExamined === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl bg-secondary/40 p-5"><CalendarClock className="size-7 text-primary" /><p className="text-sm font-bold">Start with your first event</p><p className="text-sm text-muted-foreground">Your launch checklist and growth actions appear here as you create and publish events.</p>{canCreate && <Button size="sm" onClick={() => navigate('/organizer?tab=events&new=1')}>Create event <ArrowRight className="ml-1 size-3.5" /></Button>}</div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-4"><CheckCheck className="size-6 shrink-0 text-emerald-600" /><div><p className="text-sm font-bold">No actions in this filter</p><p className="text-xs text-muted-foreground">Your tracked event setup looks good for the selected priority. Continue checking performance as dates approach.</p></div></div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <article key={item.id} className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-secondary/25 sm:flex-row sm:items-center sm:p-4">
                <span className={'flex size-9 shrink-0 items-center justify-center rounded-xl ' + (item.priority === 'critical' || item.priority === 'high' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary')}>
                  {item.priority === 'critical' || item.priority === 'high' ? <TriangleAlert className="size-4.5" /> : item.action === 'promotions' ? <Megaphone className="size-4.5" /> : <ChartNoAxesCombined className="size-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{item.title}</p><Badge variant="outline" className={'text-[10px] ' + PRIORITY[item.priority].className}>{PRIORITY[item.priority].label}</Badge></div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{item.eventTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-foreground/80">Evidence: {item.evidence}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/event/${item.eventSlug}`)}>View event</Button>
                  {canCreate && <Button size="sm" className="h-8" onClick={() => navigate(`/organizer?tab=${item.action}`)}>{item.actionLabel} <ArrowRight className="ml-1 size-3.5" /></Button>}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Transparent rules · not predictive AI</span>
          {compact ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/organizer?tab=growth')}>View all actions</button> : <span>{payload.note}</span>}
        </div>
      </div>
    </section>
  )
}
