'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Sparkles, Radio, MapPin, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api, qs } from '../api'
import { navigate, type Route } from '../router'
import { EventCard, EventCardSkeleton, EmptyState, type EventCardData } from '../components/EventCard'
import { usePortal } from '../store'

interface Category {
  slug: string
  name: string
  icon: string
}

interface HomePayload {
  featured: EventCardData[]
  upcoming: EventCardData[]
  liveNow: EventCardData[]
  categories: Category[]
  sponsored: { campaignId: string; event: EventCardData; sponsored: boolean }[]
  stats: { upcomingEvents: number; organizers: number; liveNow: number }
}

const WHEN_CHIPS = [
  { value: '', label: 'Any date' },
  { value: 'TODAY', label: 'Today' },
  { value: 'THIS_WEEK', label: 'This week' },
  { value: 'THIS_WEEKEND', label: 'This weekend' },
]

export default function Discover({ route }: { route: Route }) {
  const { user } = usePortal()
  const [home, setHome] = useState<HomePayload | null>(null)
  const [items, setItems] = useState<EventCardData[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const isSearch = route.segments[0] === 'search'
  const searchQuery = route.query.get('q') ?? ''

  const [filters, setFilters] = useState({
    q: searchQuery,
    category: '',
    city: '',
    mode: '',
    price: '',
    when: '',
  })
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    setFilters((f) => ({ ...f, q: searchQuery }))
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (isSearch) return
    void api.get<HomePayload>('/discovery/home').then((data) => {
      setHome(data)
      setItems(null)
    }).catch(() => setHome(null))
  }, [isSearch])

  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  const loadList = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      try {
        const result = await api.get<{ items: EventCardData[]; total: number }>(`/events${qs({ ...filters, page: targetPage, pageSize: 12 })}`)
        setItems(result.items)
        setTotal(result.total)
      } catch {
        setItems([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [filterKey] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const browsing = isSearch || Boolean(filters.category || filters.city || filters.mode || filters.price || filters.when || filters.q)

  useEffect(() => {
    if (browsing) void loadList(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browsing, filterKey, page])

  const applyFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const sponsoredEvents = home?.sponsored ?? []

  return (
    <div>
      {/* Hero */}
      {!browsing && (
        <section className="ievx-hero relative border-b border-border/60">
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-banner.png" alt="" className="h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
            <Badge className="mb-4 gap-1.5 bg-accent text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ghana&apos;s events, tickets & live streams — in one place
            </Badge>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Discover your next <span className="ievx-gradient-text">gathering</span>.<br className="hidden sm:block" />
              Attend in person or live online.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
              Church services, concerts, conferences, workshops and community moments — with secure mobile-money checkout,
              QR tickets and protected live broadcasts.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" className="rounded-full ievx-press" onClick={() => document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })}>
                Browse events
              </Button>
              <Button size="lg" variant="outline" className="rounded-full bg-card/70 ievx-press" onClick={() => navigate('/live')}>
                <Radio className="mr-2 h-4 w-4" /> Watch live now
              </Button>
            </div>
            {home && (
              <div className="mt-8 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><TrendingUp className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />{home.stats.upcomingEvents} upcoming events</span>
                <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><MapPin className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />{home.stats.organizers} verified organizers</span>
                <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><Radio className="mr-1.5 inline h-4 w-4 text-destructive" aria-hidden />{home.stats.liveNow} live right now</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Search + filters */}
      <section id="browse" className="sticky top-16 z-20 border-b border-border/50 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <form
            className="flex min-w-0 flex-1 items-center"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement
              applyFilter('q', input.value)
              if (input.value) navigate(`/search?q=${encodeURIComponent(input.value)}`, { replace: true })
            }}
          >
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                defaultValue={filters.q}
                key={filters.q}
                type="search"
                placeholder="Search events, organizers, cities…"
                aria-label="Search events"
                className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1 md:flex">
              {WHEN_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => applyFilter('when', chip.value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ievx-press ${
                    filters.when === chip.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <button
                onClick={() => navigate('/live')}
                className="rounded-full border border-destructive/30 bg-destructive/5 px-3.5 py-1.5 text-xs font-semibold text-destructive ievx-press"
              >
                Live now
              </button>
            </div>
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="rounded-full">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Filters</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px]">
                <SheetHeader>
                  <SheetTitle>Refine events</SheetTitle>
                </SheetHeader>
                <div className="space-y-5 px-4 pb-8">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
                    <Select value={filters.category || 'any'} onValueChange={(v) => applyFilter('category', v === 'any' ? '' : v)}>
                      <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">All categories</SelectItem>
                        {(home?.categories ?? []).map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">City</p>
                    <input
                      value={filters.city}
                      onChange={(e) => applyFilter('city', e.target.value)}
                      placeholder="e.g. Accra, Tema"
                      aria-label="City filter"
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format</p>
                    <Select value={filters.mode || 'any'} onValueChange={(v) => applyFilter('mode', v === 'any' ? '' : v)}>
                      <SelectTrigger aria-label="Format"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">In person & online</SelectItem>
                        <SelectItem value="PHYSICAL">In person</SelectItem>
                        <SelectItem value="VIRTUAL">Online only</SelectItem>
                        <SelectItem value="HYBRID">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</p>
                    <Select value={filters.price || 'any'} onValueChange={(v) => applyFilter('price', v === 'any' ? '' : v)}>
                      <SelectTrigger aria-label="Price"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Free & paid</SelectItem>
                        <SelectItem value="FREE">Free only</SelectItem>
                        <SelectItem value="PAID">Paid only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WHEN_CHIPS.map((chip) => (
                        <button
                          key={chip.value}
                          onClick={() => applyFilter('when', chip.value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filters.when === chip.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button className="w-full rounded-full" onClick={() => { setFilters({ q: '', category: '', city: '', mode: '', price: '', when: '' }); setPage(1); setFiltersOpen(false) }}>
                    <X className="mr-1 h-4 w-4" /> Clear all filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {/* Category chips */}
        {home?.categories && !browsing && (
          <div className="ievx-scrollbar mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3">
            {home.categories.map((c) => (
              <button
                key={c.slug}
                onClick={() => applyFilter('category', c.slug)}
                className="shrink-0 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary ievx-press"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Sponsored placements (labelled) */}
        {!browsing && sponsoredEvents.length > 0 && (
          <section className="mb-10" aria-label="Sponsored events">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-lg font-bold">Promoted for you</h2>
              <Badge variant="secondary" className="text-[10px]">Sponsored</Badge>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sponsoredEvents.map((s, i) => (
                <EventCard key={s.event.id} event={s.event} index={i} />
              ))}
            </div>
          </section>
        )}

        {browsing ? (
          <section aria-label="Search results">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-bold">
                {isSearch && searchQuery ? `Results for “${searchQuery}”` : 'Browse events'}
              </h2>
              <p className="text-sm text-muted-foreground">{total} event{total !== 1 ? 's' : ''}</p>
            </div>
            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)}
              </div>
            ) : items && items.length > 0 ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
                {page * 12 < total && (
                  <div className="mt-8 text-center">
                    <Button variant="outline" className="rounded-full" onClick={() => setPage((p) => p + 1)}>Load more</Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="No events match those filters"
                description="Try a different category, city or date — or clear the filters to see everything."
                action={<Button className="mt-2 rounded-full" onClick={() => setFilters({ q: '', category: '', city: '', mode: '', price: '', when: '' })}>Clear filters</Button>}
              />
            )}
          </section>
        ) : (
          <>
            {home?.liveNow && home.liveNow.length > 0 && (
              <section className="mb-10" aria-label="Live now">
                <div className="mb-4 flex items-center gap-2">
                  <span className="ievx-live-dot" />
                  <h2 className="text-lg font-bold">Happening live</h2>
                  <Button variant="ghost" size="sm" className="ml-auto rounded-full" onClick={() => navigate('/live')}>See all</Button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {home.liveNow.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            {home?.featured && home.featured.length > 0 && (
              <section className="mb-10" aria-label="Featured events">
                <h2 className="mb-4 text-lg font-bold">Featured gatherings</h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {home.featured.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            <section aria-label="Upcoming events">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Coming up</h2>
                {user && <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/me?tab=saved')}>Saved events</Button>}
              </div>
              {home === null ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)}
                </div>
              ) : home.upcoming.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {home.upcoming.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              ) : (
                <EmptyState title="No upcoming events yet" description="Check back soon — organizers are preparing their next gatherings." />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
