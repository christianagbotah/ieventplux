'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, SlidersHorizontal, Radio, MapPin, TrendingUp, X, ArrowRight, Wand2,
  Church, Music, Presentation, Wrench, Code2, Heart, Users, Sparkles as SparklesIcon,
  PartyPopper, Activity, Smartphone, QrCode, CalendarCheck, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api, qs } from '../api'
import { navigate, type Route } from '../router'
import { EventCard, EventCardSkeleton, EmptyState, type EventCardData } from '../components/EventCard'
import { AiSearchPanel } from '../components/AiSearchPanel'
import { ForYouRail } from '../components/ForYouRail'
import { usePortal } from '../store'

interface Category {
  slug: string
  name: string
  icon: string
  color?: string | null
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

// Category icons from the DB (`icon` slug) → lucide components, tinted with each category's brand color.
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  church: Church,
  music: Music,
  presentation: Presentation,
  wrench: Wrench,
  code: Code2,
  heart: Heart,
  users: Users,
  sparkles: SparklesIcon,
  'party-popper': PartyPopper,
  activity: Activity,
}

const EMPTY_FILTERS = { q: '', category: '', city: '', mode: '', price: '', when: '' }

/** Animated number for hero stats (respects prefers-reduced-motion). */
function useCountUp(target: number | null, durationMs = 900): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === null || target === 0) {
      setValue(target ?? 0)
      return
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: 'Find your gathering',
    body: 'Search by category, city or date. Save what you love and follow organizers you trust.',
  },
  {
    icon: Smartphone,
    title: 'Pay with mobile money',
    body: 'Secure Hubtel checkout (MoMo & cards) — free events simply take an RSVP. Refunds are real and tracked.',
  },
  {
    icon: QrCode,
    title: 'Scan & step in',
    body: 'Your QR ticket works at the gate — or watch live online with a protected virtual pass.',
  },
]

export default function Discover({ route }: { route: Route }) {
  const { user } = usePortal()
  const [home, setHome] = useState<HomePayload | null>(null)
  const [items, setItems] = useState<EventCardData[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [browseAll, setBrowseAll] = useState(false)
  const isSearch = route.segments[0] === 'search'
  const searchQuery = route.query.get('q') ?? ''

  const statEvents = useCountUp(home?.stats.upcomingEvents ?? null)
  const statOrgs = useCountUp(home?.stats.organizers ?? null)
  const statLive = useCountUp(home?.stats.liveNow ?? null)

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, q: searchQuery })
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
    [filterKey]  
  )

  const browsing = isSearch || browseAll || Boolean(filters.category || filters.city || filters.mode || filters.price || filters.when || filters.q)

  useEffect(() => {
    if (browsing) void loadList(page)
  }, [browsing, filterKey, page])

  const applyFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS })
    setPage(1)
    setBrowseAll(false)
    setFiltersOpen(false)
  }

  const sponsoredEvents = home?.sponsored ?? []
  // Featured (or first upcoming) gathering powers the hero CTA.
  const primaryEvent = home?.featured[0] ?? home?.upcoming[0]

  return (
    <div>
      {/* Hero */}
      {!browsing && (
        <section className="relative border-b border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
            <div className="efx-aurora-bg iefx-stage">
              {/* Brand artwork, dimmed so the aurora ribbons stay the lead act */}
              <img
                src="/images/hero-banner.png"
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#031a15] via-[#031a15]/80 to-[#031a15]/25" aria-hidden />
              <div className="efx-aurora-bg__content" style={{ zIndex: 1 }}>
                <span className="efx-aurora-bg__kicker">ACCRA · GHANA · TICKETING, SOCIAL & BROADCASTING</span>
                <h1 className="efx-animated-gradient-text iefx-headline max-w-2xl">
                  Discover your next gathering.
                  <br className="hidden sm:block" />{' '}
                  Attend in person or live online.
                </h1>
                <p className="efx-aurora-bg__meta max-w-xl" style={{ marginTop: '1rem' }}>
                  Church services, concerts, conferences, workshops and community moments — with secure mobile-money checkout,
                  QR tickets and protected live broadcasts.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="efx-neon-pulse-button"
                    style={{ fontSize: '0.95rem', padding: '0.8rem 1.7rem' }}
                    aria-label={primaryEvent ? `View featured event: ${primaryEvent.title}` : 'Browse the event grid'}
                    onClick={() => {
                      if (primaryEvent) {
                        navigate(`/event/${primaryEvent.slug}`)
                      } else {
                        setBrowseAll(true)
                        setPage(1)
                        document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })
                      }
                    }}
                  >
                    {primaryEvent ? 'View featured event' : 'Browse all events'}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                  <Button size="lg" variant="outline" className="rounded-full bg-card/70 ievx-press" onClick={() => document.getElementById('ai-search')?.scrollIntoView({ behavior: 'smooth' })}>
                    <Wand2 className="mr-2 h-4 w-4" aria-hidden /> Ask AI to find events
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full bg-card/70 ievx-press" onClick={() => navigate('/live')}>
                    <Radio className="mr-2 h-4 w-4" /> Watch live
                  </Button>
                </div>
                {/* Quick links — the fastest paths into the catalogue */}
                <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
                  <span className="pr-1 text-xs font-medium uppercase tracking-wide" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Quick find:</span>
                  {[
                    { label: 'Today', filter: () => applyFilter('when', 'TODAY') },
                    { label: 'This weekend', filter: () => applyFilter('when', 'THIS_WEEKEND') },
                    { label: 'Free events', filter: () => applyFilter('price', 'FREE') },
                    { label: 'Online only', filter: () => applyFilter('mode', 'VIRTUAL') },
                  ].map((quick) => (
                    <button
                      key={quick.label}
                      type="button"
                      onClick={quick.filter}
                      className="rounded-full px-2.5 py-1 text-xs font-medium underline-offset-4 transition-colors hover:bg-white/10 hover:underline ievx-press"
                      style={{ color: '#a7f3d0' }}
                    >
                      {quick.label}
                    </button>
                  ))}
                </div>
                {home && (
                  <div className="mt-8 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><TrendingUp className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />{statEvents} upcoming event{statEvents !== 1 ? 's' : ''}</span>
                    <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><MapPin className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />{statOrgs} verified organizer{statOrgs !== 1 ? 's' : ''}</span>
                    <span className="rounded-full bg-card/80 px-4 py-2 font-semibold backdrop-blur"><Radio className="mr-1.5 inline h-4 w-4 text-destructive" aria-hidden />{statLive} live right now</span>
                  </div>
                )}
              </div>
            </div>
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
            <div className="efx-glow-focus-input w-full" style={{ margin: 0, maxWidth: '28rem', borderRadius: '999px' }}>
              <Search className="efx-glow-focus-input__icon pointer-events-none" style={{ width: 18, height: 18 }} aria-hidden />
              <input
                name="q"
                defaultValue={filters.q}
                key={filters.q}
                type="search"
                placeholder="Search events, organizers, cities…"
                aria-label="Search events"
                className="efx-glow-focus-input__field"
                style={{ padding: '0.55rem 0' }}
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
                type="button"
                onClick={() => navigate('/live')}
                className="relative rounded-full border border-destructive/30 bg-destructive/5 px-3.5 py-1.5 pr-5 text-xs font-semibold text-destructive ievx-press"
              >
                <span className="efx-badge-ping__ping" aria-hidden style={{ width: 8, height: 8, top: 'calc(50% - 4px)', right: 6 }} />
                <span className="efx-badge-ping__dot" aria-hidden style={{ width: 8, height: 8, top: 'calc(50% - 4px)', right: 6 }} />
                <span className="relative">Live now</span>
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
                  <Button className="w-full rounded-full" onClick={clearFilters}>
                    <X className="mr-1 h-4 w-4" /> Clear all filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {/* Category chips — icon + brand colour for fast visual navigation */}
        {home?.categories && !browsing && (
          <div className="ievx-scrollbar mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3">
            {home.categories.map((c) => {
              const Icon = CATEGORY_ICONS[c.icon] ?? SparklesIcon
              return (
                <button
                  key={c.slug}
                  onClick={() => applyFilter('category', c.slug)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary ievx-press"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Ask-iEventPlux: natural-language search over the real catalogue */}
        <div className="mb-10">
          <AiSearchPanel />
        </div>

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
                {isSearch && searchQuery ? `Results for “${searchQuery}”` : browseAll && !filters.category && !filters.q ? 'All upcoming events' : 'Browse events'}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">{total} event{total !== 1 ? 's' : ''}</p>
                <Button variant="ghost" size="sm" className="rounded-full" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" aria-hidden /> Reset
                </Button>
              </div>
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
                action={<Button className="mt-2 rounded-full" onClick={clearFilters}>Clear filters</Button>}
              />
            )}
          </section>
        ) : (
          <>
            {user && <ForYouRail />}
            {home?.liveNow && home.liveNow.length > 0 && (
              <section className="mb-10" aria-label="Live now">
                <div className="mb-4 flex items-center gap-2">
                  <span className="ievx-live-dot" />
                  <h2 className="text-lg font-bold">Happening live</h2>
                  <button
                    type="button"
                    className="efx-underline-slide-link ml-auto"
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                    onClick={() => navigate('/live')}
                  >
                    See all
                  </button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {home.liveNow.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            {home?.featured && home.featured.length > 0 && (
              <section className="mb-10" aria-label="Featured events">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">Featured gatherings</h2>
                  <button
                    type="button"
                    className="efx-underline-slide-link"
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                    onClick={() => { setBrowseAll(true); setPage(1) }}
                  >
                    Browse all <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {home.featured.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            <section className="mb-10" aria-label="Upcoming events">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Coming up</h2>
                <div className="flex items-center gap-2">
                  {user && <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/me?tab=saved')}>Saved events</Button>}
                  <button
                    type="button"
                    className="efx-underline-slide-link"
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                    onClick={() => { setBrowseAll(true); setPage(1) }}
                  >
                    Browse all <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
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

            {/* How it works — reassurance for first-time buyers */}
            <section className="mb-10" aria-label="How it works">
              <div className="mb-4 flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-bold">How iEventPlux works</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <div key={step.title} className="rounded-2xl border border-border/60 bg-card p-5 ievx-card-hover">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <step.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Step {i + 1}</span>
                    </div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Organizer CTA — the two-sided marketplace, made explicit */}
            <section aria-label="For organizers" className="mb-4">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-emerald-700 p-8 text-primary-foreground sm:p-10">
                <Building2 className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-10" aria-hidden />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <h2 className="text-xl font-extrabold sm:text-2xl">Organizing a gathering?</h2>
                    <p className="mt-2 text-sm leading-relaxed text-primary-foreground/85">
                      Publish in minutes — ticketing with mobile-money checkout, QR check-in scanning, live broadcasts,
                      promotions, payouts and finance reports built in. Verified organizers keep 95% of face value.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Button
                      size="lg"
                      className="rounded-full bg-background font-bold text-foreground hover:bg-background/90 ievx-press"
                      onClick={() => navigate(user ? '/create-org' : '/register')}
                    >
                      {user ? 'Create your organization' : 'Start organizing'} <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
