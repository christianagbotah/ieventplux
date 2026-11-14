'use client'

import { useEffect, useState } from 'react'
import { Radio, Monitor, Play, Users, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { api } from '../api'
import { navigate } from '../router'
import { EmptyState } from '../components/EventCard'
import { money, dateLong, humanize } from '../format'

interface BroadcastRow {
  id: string
  title: string
  description?: string | null
  accessPolicy: string
  priceMinor?: number | null
  replayPriceMinor?: number | null
  status: string
  startedAt?: string | null
  endedAt?: string | null
  minutesUsed?: number | null
  viewerCapacity: number
  event: { id: string; title: string; slug: string; coverImageUrl?: string | null; org: { name: string; slug: string } }
}

export default function LiveNow() {
  const [live, setLive] = useState<BroadcastRow[] | null>(null)
  const [replays, setReplays] = useState<BroadcastRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setRefreshing(true)
    void api
      .get<{ live: BroadcastRow[]; replays: BroadcastRow[] }>('/discovery/live', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setLive(data.live)
        setReplays(data.replays)
        setLoadError(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLoadError(true)
        // Initial network errors must leave the skeleton state and reveal the
        // accessible retry view. Subsequent failures keep the last known list.
        setLive((previous) => previous ?? [])
        setReplays((previous) => previous ?? [])
      }).finally(() => {
        if (!controller.signal.aborted) setRefreshing(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const id = window.setInterval(() => setRefreshKey((current) => current + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const accessLabel = (b: BroadcastRow) =>
    b.accessPolicy === 'FREE' ? 'Free stream' : b.accessPolicy === 'PAID' ? (b.priceMinor ? `Pass ${money(b.priceMinor)}` : 'Paid pass') : b.accessPolicy === 'TICKET_HOLDERS' ? 'Ticket holders' : 'Invitation only'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><Radio className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="ievx-section-title text-2xl">Live & replays</h1>
          <p className="text-sm text-muted-foreground">Free streams, paid masterclasses and ticket-holder broadcasts.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto rounded-full"
          disabled={refreshing}
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> Refresh
        </Button>
      </div>

      {loadError && (
        <div role="alert" className="ievx-surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>Live broadcasts could not be refreshed. Showing the last available results, if any.</span>
          <Button size="sm" variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>Retry</Button>
        </div>
      )}

      {live !== null && live.length > 0 && (
        <div className="mb-8">
          <div className="ievx-surface flex items-center gap-3 border-destructive/20 bg-destructive/5 px-5 py-4">
            <span className="ievx-live-dot" aria-hidden />
            <h2 className="text-lg font-extrabold tracking-tight">On air now</h2>
            <span className="ml-auto text-sm font-semibold text-muted-foreground">{live.length} broadcast{live.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      {live === null ? (
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ievx-skeleton h-56 rounded-2xl" />)}
        </div>
      ) : live.length === 0 && loadError ? (
        <EmptyState title="Live broadcasts unavailable" description="The live feed could not be loaded. Please retry." action={<Button variant="outline" className="rounded-full" onClick={() => setRefreshKey((current) => current + 1)}>Retry</Button>} />
      ) : live.length === 0 ? (
        <EmptyState title="No live broadcasts right now" description="Follow organizers to get notified the moment they go live." action={<Button className="rounded-full" onClick={() => navigate('/')}>Discover events</Button>} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {live.map((b, i) => (
            <Card key={b.id} className="ievx-card-hover group overflow-hidden rounded-2xl" style={{ animationDelay: `${i * 60}ms` }}>
              <button className="block w-full text-left" onClick={() => navigate(`/broadcast/${b.id}`)} aria-label={`Watch ${b.title}`}>
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {b.event.coverImageUrl && (
                    <img src={b.event.coverImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-black/35" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold uppercase text-white">
                    <span className="ievx-live-dot" style={{ background: 'white' }} /> Live
                    <span className="efx-badge-ping__ping" aria-hidden style={{ left: '10px', right: 'auto', top: 'calc(50% - 4px)', width: '8px', height: '8px' }} />
                  </span>
                  <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg transition-transform group-hover:scale-110">
                    <Play className="ml-0.5 h-6 w-6 fill-primary" aria-hidden />
                  </span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
                    <p className="font-semibold text-white">{b.title}</p>
                    <p className="text-xs text-white/80">{b.event.org.name}{b.startedAt ? ` · started ${new Date(b.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
                  </div>
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[11px]">{accessLabel(b)}</Badge>
                  <Badge variant="secondary" className="text-[11px] gap-1"><Users className="h-3 w-3" /> cap {b.viewerCapacity.toLocaleString()}</Badge>
                </div>
                <button
                  type="button"
                  className="efx-ripple-click-button ievx-press"
                  style={{ fontSize: '0.9rem', padding: '0.65rem 1.4rem', borderRadius: '999px' }}
                  onClick={() => navigate(`/broadcast/${b.id}`)}
                >
                  Watch now
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {replays && replays.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Monitor className="h-5 w-5 text-primary" aria-hidden /> Replays & recordings</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {replays.map((b) => (
              <button key={b.id} className="ievx-card-hover overflow-hidden rounded-2xl border border-border/70 bg-card text-left" onClick={() => navigate(`/broadcast/${b.id}`)}>
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {b.event.coverImageUrl && (
                    <img src={b.event.coverImageUrl} alt="" className="h-full w-full object-cover opacity-80" loading="lazy" />
                  )}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">REPLAY</span>
                </div>
                <div className="p-3.5">
                  <p className="truncate text-sm font-semibold">{b.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{b.event.org.name}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {b.endedAt ? dateLong(b.endedAt) : ''}{b.minutesUsed ? ` · ${Math.round(b.minutesUsed)} min` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{accessLabel(b)}</Badge>
                    {b.replayPriceMinor !== null && b.replayPriceMinor !== undefined && b.replayPriceMinor > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">Replay {money(b.replayPriceMinor)}</Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
