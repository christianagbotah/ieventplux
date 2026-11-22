'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Copy, Globe2, Loader2, Share2, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { api } from '../api'
import { navigate, type Route } from '../router'
import { countryLabel } from '../lib/global-locations'
import { humanize } from '../format'
import { inventoryState, priceLabel, type EventCardData } from '../components/EventCard'
import { comparePath, parseCompareIds } from '@/server/public-event-compare'

function dateLabel(iso: string | undefined): string {
  if (!iso) return 'Not announced'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not announced'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function EventCompareView({ route }: { route: Route }) {
  const { toast } = useToast()
  const raw = route.query.get('ids')
  const requestedCount = (() => {
    try { return parseCompareIds(raw).length }
    catch { return 0 }
  })()
  const [items, setItems] = useState<EventCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareLink, setShareLink] = useState('')

  useEffect(() => {
    let ids: string[]
    try { ids = parseCompareIds(raw) }
    catch {
      queueMicrotask(() => { setItems([]); setError('Choose events from Discover to compare them.'); setLoading(false) })
      return
    }
    const controller = new AbortController()
    void api.get<{ items: EventCardData[] }>('/discovery/compare?ids=' + encodeURIComponent(ids.join(',')), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setItems(result.items)
        setError('')
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setItems([])
        setError('Event comparison could not load. Check your connection and try again.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [raw])

  const timezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone }
    catch { return 'your local time zone' }
  }, [])

  const remove = (id: string) => {
    const next = items.filter((event) => event.id !== id).map((event) => event.id)
    try { window.localStorage.setItem('ievx-event-compare-v1', JSON.stringify(next)) } catch { /* storage optional */ }
    if (!next.length) navigate('/')
    else navigate(comparePath(next), { replace: true })
  }

  const share = async () => {
    if (items.length < 2) return
    const link = window.location.origin + '/#' + comparePath(items.map((event) => event.id))
    setShareLink(link)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Compare events on iEventPlux', url: link })
        return
      } catch { /* Cancelled or unsupported: fall back to copy. */ }
    }
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Comparison link copied', description: 'Anyone with the link can compare these public events.' })
    } catch {
      toast({ title: 'Share link ready', description: 'Copy the URL shown below to share this comparison.' })
    }
  }

  const valueRows: { label: string; value: (event: EventCardData) => string }[] = [
    { label: 'Start', value: (event) => dateLabel(event.startsAt) },
    { label: 'End', value: (event) => dateLabel(event.endsAt) },
    { label: 'Format', value: (event) => humanize(event.mode || 'PHYSICAL') },
    { label: 'Location', value: (event) => event.mode === 'VIRTUAL' ? 'Online, anywhere' : [event.city, event.country ? countryLabel(event.country) : ''].filter(Boolean).join(', ') || 'See event details' },
    { label: 'Entry', value: (event) => priceLabel(event) },
    { label: 'Tickets', value: (event) => inventoryState(event) === 'SOLD_OUT' ? 'Sold out' : inventoryState(event) === 'SELLING_FAST' ? 'Selling fast' : 'See ticket options' },
    { label: 'Organizer', value: (event) => (event.org?.name || 'Not shown') + (event.org?.verifiedAt ? ' · Verified' : '') },
    { label: 'Category', value: (event) => humanize(event.categorySlug || 'General') },
    { label: 'Status', value: (event) => humanize(event.status || 'PUBLISHED') },
  ]

  return <main className="mx-auto w-full max-w-[1260px] min-w-0 px-3 py-6 pb-28 sm:px-6 sm:py-9">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <button type="button" className="mb-3 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" onClick={() => navigate('/')}>
          <ArrowLeft className="size-4" aria-hidden /> Discover events
        </button>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary"><SlidersHorizontal className="size-4" aria-hidden /> Smarter event decisions</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">Compare events side by side</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Find the experience that fits your schedule, budget and location. Prices are shown in each event's original currency; no misleading currency conversion.
        </p>
      </div>
      {items.length >= 2 && <Button type="button" className="min-h-11 rounded-xl" onClick={() => void share()}>
        <Share2 className="size-4" aria-hidden /> Share comparison
      </Button>}
    </div>

    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary" className="rounded-full">{items.length} of 3 events</Badge>
      <span className="inline-flex items-center gap-1"><Globe2 className="size-3.5" aria-hidden /> Times shown in {timezone.replaceAll('_', ' ')}</span>
      <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" aria-hidden /> Public events only</span>
    </div>

    {shareLink && <div className="mb-4 rounded-2xl border bg-card p-3">
      <label htmlFor="event-compare-share-url" className="mb-1 block text-xs font-semibold">Shareable comparison link</label>
      <input id="event-compare-share-url" readOnly value={shareLink} onFocus={(event) => event.target.select()}
        className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-xs" />
    </div>}

    {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border bg-card text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Loading comparisons…</div>
      : error ? <div role="alert" className="space-y-3 rounded-3xl border bg-card p-8 text-center">
        <p className="font-semibold">{error}</p>
        <Button variant="outline" className="min-h-11" onClick={() => navigate('/')}>Find events</Button>
      </div> : items.length === 0 ? <div className="rounded-3xl border bg-card p-8 text-center">
        <p className="font-semibold">These events are not publicly available.</p>
        <p className="mt-2 text-sm text-muted-foreground">Private, cancelled or removed events are not disclosed through comparison links.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>Discover public events</Button>
      </div> : <>
        {requestedCount > items.length && <p role="status" className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">Some selected events are no longer publicly available and have been excluded.</p>}
        <div className="rounded-3xl border border-border/80 bg-card shadow-sm">
          <div role="region" aria-label="Scroll sideways to compare public events" tabIndex={0} className="overflow-x-auto rounded-3xl">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-[118px] min-w-[118px] border-b border-r bg-card p-3 align-bottom text-xs font-semibold text-muted-foreground sm:w-[155px]">Compare</th>
                  {items.map((event) => <th key={event.id} scope="col" className="w-[220px] min-w-[220px] border-b border-r p-3 align-top last:border-r-0 sm:min-w-[280px]">
                    <div className="space-y-2">
                      {event.coverImageUrl ? <img src={event.coverImageUrl} alt="" loading="lazy" className="aspect-[16/9] w-full rounded-xl object-cover" /> : <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="size-8" aria-hidden /></div>}
                      <div className="flex items-start justify-between gap-1">
                        <span className="line-clamp-3 min-w-0 font-bold text-foreground">{event.title}</span>
                        <button type="button" aria-label={'Remove ' + event.title + ' from comparison'} onClick={() => remove(event.id)}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                {valueRows.map((row, i) => <tr key={row.label} className={i % 2 === 0 ? 'bg-secondary/20' : ''}>
                  <th scope="row" className={'sticky left-0 z-10 min-w-[118px] border-b border-r px-3 py-4 align-top text-xs font-semibold sm:min-w-[155px] ' + (i % 2 === 0 ? 'bg-secondary' : 'bg-card')}>{row.label}</th>
                  {items.map((event) => <td key={event.id} className="min-w-[220px] border-b border-r px-3 py-4 align-top text-sm last:border-r-0 sm:min-w-[280px]">{row.value(event)}</td>)}
                </tr>)}
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-r bg-card px-3 py-5 text-xs font-semibold">Next action</th>
                  {items.map((event) => <td key={event.id} className="border-r px-3 py-5 last:border-r-0">
                    <Button type="button" className="min-h-11 w-full rounded-xl" onClick={() => navigate('/event/' + event.slug)}>View event <ArrowUpRight className="size-4" aria-hidden /></Button>
                  </td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Swipe the comparison table horizontally on mobile. Ticket availability and prices can change; confirm the latest details before booking.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => navigate('/')}><ArrowLeft className="size-4" aria-hidden /> Add another event</Button>
          {items.length >= 2 && <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => void share()}><Copy className="size-4" aria-hidden /> Share shortlist</Button>}
        </div>
      </>}
  </main>
}
