'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, SlidersHorizontal, Radio, MapPin, TrendingUp, X, ArrowRight, Wand2,
  Church, Music, Presentation, Wrench, Code2, Heart, Users, Sparkles as SparklesIcon,
  PartyPopper, Activity, Smartphone, QrCode, CalendarCheck, Building2,
  CalendarDays, ChevronRight, Monitor, Globe2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api, qs } from '../api'
import { navigate, type Route } from '../router'
import { dateShort, humanize } from '../format'
import { EventCard, EventCardSkeleton, EmptyState, priceLabel, type EventCardData } from '../components/EventCard'
import { AiSearchPanel } from '../components/AiSearchPanel'
import { ForYouRail } from '../components/ForYouRail'
import { PlannerPanel } from '../components/PlannerPanel'
import { usePortal } from '../store'
import { countryLabel } from '../lib/global-locations'

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
  cities: string[]
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

const EMPTY_FILTERS = { q: '', category: '', country: '', city: '', mode: '', price: '', when: '' }

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
    title: 'Book free or paid events',
    body: 'RSVP to free events or use an available payment method at checkout. Paid transactions are only enabled in supported regions.',
  },
  {
    icon: QrCode,
    title: 'Scan & step in',
    body: 'Your QR ticket works at the gate — or watch live online with a protected virtual pass.',
  },
]

/**
 * R19 — compact horizontal promo card for the sponsored rail. The old portrait
 * EventCard here put a ~520px-tall banner at mobile widths; a promo row (small
 * thumb + one-line title + date/city/price) reads like a native ad, stays
 * honest with its "Promoted" label and keeps the home page compact.
 */
function SponsoredCard({ event, index }: { event: EventCardData; index: number }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`View promoted event: ${event.title}`}
      className="ievx-card-hover ievx-event-card group flex-row items-stretch gap-0 overflow-hidden rounded-2xl border-border/70 bg-card py-0 cursor-pointer"
      style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/event/${event.slug}`)
        }
      }}
      onClick={() => navigate(`/event/${event.slug}`)}
    >
      <div className="relative w-24 shrink-0 overflow-hidden bg-muted sm:w-36">
        {event.coverImageUrl && !imgFailed ? (
          <img
            src={event.coverImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-accent/20 to-primary/5 p-1.5 text-center">
            <span className="line-clamp-3 text-[10px] font-semibold text-foreground/70">{event.title}</span>
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground shadow">Promoted</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
        <p className="truncate text-sm font-semibold leading-snug group-hover:text-primary">{event.title}</p>
        {event.org?.name && (
          <p className="truncate text-xs text-muted-foreground">{event.org.name}{event.org.verifiedAt ? ' · Verified' : ''}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {dateShort(event.startsAt)}
          {event.city && (
            <>
              <MapPin className="ml-1 h-3.5 w-3.5 shrink-0" aria-hidden />
              {event.city}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Badge variant="outline" className="gap-1 text-[10px] capitalize">
            {event.mode === 'VIRTUAL' ? <Monitor className="h-3 w-3" /> : event.mode === 'HYBRID' ? <Radio className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {humanize(event.mode ?? 'Physical')}
          </Badge>
          <span className="text-sm font-bold text-primary">{priceLabel(event)}</span>
        </div>
      </div>
      <div className="flex items-center pr-3">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
      </div>
    </Card>
  )
}

export default function Discover({ route }: { route: Route }) {
  const { user } = usePortal()
  const [home, setHome] = useState<HomePayload | null>(null)
  const [items, setItems] = useState<EventCardData[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [homeError, setHomeError] = useState(false)
  const [homeRetry, setHomeRetry] = useState(0)
  const [browseAll, setBrowseAll] = useState(false)
  const isSearch = route.segments[0] === 'search'
  const searchQuery = route.query.get('q') ?? ''

  const statEvents = useCountUp(home?.stats.upcomingEvents ?? null)
  const statOrgs = useCountUp(home?.stats.organizers ?? null)
  const statLive = useCountUp(home?.stats.liveNow ?? null)

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, q: searchQuery })
  const [countries, setCountries] = useState<{ code: string; count: number }[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [attendeeTimeZone, setAttendeeTimeZone] = useState('UTC')
  useEffect(() => {
    try { setAttendeeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') } catch { /* UTC fallback */ }
    const controller = new AbortController()
    void api.get<{ countries: { code: string; count: number }[]; categories: Category[] }>('/discovery/locations', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setCountries(data.countries); setCategories(data.categories) } })
      .catch(() => { /* Discovery still works if region suggestions cannot load. */ })
    return () => controller.abort()
  }, [])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)

  useEffect(() => {
    setFilters((f) => ({ ...f, q: searchQuery }))
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (isSearch) return
    const controller = new AbortController()
    setHomeError(false)
    void api.get<HomePayload>('/discovery/home', { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setHome(data)
    }).catch(() => {
      if (!controller.signal.aborted) setHomeError(true)
    })
    return () => controller.abort()
  }, [isSearch, homeRetry])

  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  const loadList = useCallback(
    async (targetPage: number, signal: AbortSignal) => {
      setLoading(true)
      setListError(null)
      if (targetPage === 1) setItems(null)
      try {
        const result = await api.get<{ items: EventCardData[]; total: number }>(
          '/events' + qs({
            ...filters, mode: filters.mode === 'ONLINE' ? '' : filters.mode,
            access: filters.mode === 'ONLINE' ? 'ONLINE' : '',
            timezone: attendeeTimeZone, page: targetPage, pageSize: 12,
          }),
          { signal },
        )
        if (signal.aborted) return
        // A "load more" action MUST append, not replace the visible first page.
        setItems((previous) => {
          if (targetPage === 1) return result.items
          const seen = new Set((previous ?? []).map((event) => event.id))
          return [...(previous ?? []), ...result.items.filter((event) => !seen.has(event.id))]
        })
        setTotal(result.total)
      } catch {
        if (signal.aborted) return
        setListError('We could not load events. Check your connection and try again.')
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [filterKey, attendeeTimeZone],
  )

  const browsing = isSearch || browseAll || Boolean(filters.category || filters.country || filters.city || filters.mode || filters.price || filters.when || filters.q)

  useEffect(() => {
    if (!browsing) return
    const controller = new AbortController()
    void loadList(page, controller.signal)
    return () => controller.abort() // stale search results must never replace newer filters
  }, [browsing, filterKey, page, loadList, retryKey])

  const applyFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS })
    setPage(1)
    setBrowseAll(false)
    setFiltersOpen(false)
    setListError(null)
    if (isSearch) navigate('/', { replace: true })
  }

  const sponsoredEvents = home?.sponsored ?? []
  // Featured (or first upcoming) gathering powers the hero CTA.
  const primaryEvent = home?.featured[0] ?? home?.upcoming[0]

  return (
    <div>
      {/* Editorial hero — focused discovery, clear actions, no visual-effects overload. */}
      {!browsing && (
        <section className="border-b border-border/40">
          <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="ievx-hero-panel">
              <div className="relative z-10 w-full">
                <span className="ievx-hero-kicker">
                  <span className="size-2 rounded-full bg-[#7cdec4]" aria-hidden />
                  Discover real events around the world
                </span>
                <h1 className="ievx-hero-title">
                  Be where the moments happen.
                  <span className="block text-[#b2e7d5]">Discover. Attend. Connect.</span>
                </h1>
                <p className="ievx-hero-copy">
                  Discover concerts, conferences, worship, culture, sports and communities across borders.
                  Join in person or online, and follow the organizers you trust.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    className="ievx-hero-action"
                    aria-label={primaryEvent ? `View featured event: ${primaryEvent.title}` : 'Browse the event catalogue'}
                    onClick={() => {
                      if (primaryEvent) navigate(`/event/${primaryEvent.slug}`)
                      else {
                        setBrowseAll(true)
                        setPage(1)
                        document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })
                      }
                    }}
                  >
                    {primaryEvent ? 'Explore featured event' : 'Browse events'} <ArrowRight className="size-4" aria-hidden />
                  </button>
                  <button type="button" className="ievx-hero-action ievx-hero-action-secondary" onClick={() => navigate('/live')}>
                    <Radio className="size-4" aria-hidden /> Live events
                  </button>
                  <button type="button" className="rounded-lg px-3 py-2.5 text-xs font-semibold text-[#d4efe5] underline-offset-4 hover:underline" onClick={() => setPlannerOpen(true)}>
                    <CalendarCheck className="mr-1.5 inline size-4" aria-hidden /> Plan your weekend
                  </button>
                  <button type="button" className="rounded-lg px-3 py-2.5 text-xs font-semibold text-[#d4efe5] underline-offset-4 hover:underline" onClick={() => document.getElementById('ai-search')?.scrollIntoView({ behavior: 'smooth' })}>
                    <Wand2 className="mr-1.5 inline size-4" aria-hidden /> Ask AI
                  </button>
                </div>
                <div className="ievx-hero-quick">
                  <span className="mr-1 text-[11px] font-semibold text-[#b9d6d1]">Quick filters</span>
                  {[
                    { label: 'Today', filter: () => applyFilter('when', 'TODAY') },
                    { label: 'This weekend', filter: () => applyFilter('when', 'THIS_WEEKEND') },
                    { label: 'Free entry', filter: () => applyFilter('price', 'FREE') },
                    { label: 'Join online anywhere', filter: () => applyFilter('mode', 'ONLINE') },
                  ].map((quick) => (
                    <button key={quick.label} type="button" onClick={quick.filter}>{quick.label}</button>
                  ))}
                  {home && (
                    <span className="ml-auto hidden text-[11px] font-medium text-[#b9d6d1] sm:block">
                      {statEvents} upcoming · {statOrgs} organizers · {statLive} live
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search + filters */}
      <section id="browse" className="ievx-discovery-search sticky top-[52px] z-20">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-3 py-2.5 sm:px-6 lg:px-8">
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
            <div className="relative w-full max-w-[480px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                defaultValue={filters.q}
                key={filters.q}
                type="search"
                placeholder="Search events, organizers or cities"
                aria-label="Search events"
                className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </form>

          <div className="hidden sm:block">
            <Select value={filters.country || 'any'} onValueChange={(value) => applyFilter('country', value === 'any' ? '' : value)}>
              <SelectTrigger className="h-10 w-[170px] rounded-xl" aria-label="Discover events by country">
                <Globe2 className="mr-1 size-4 shrink-0" aria-hidden />
                <SelectValue placeholder="Worldwide" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Worldwide</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>{countryLabel(country.code)} ({country.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Country / region</p>
                    <Select value={filters.country || 'any'} onValueChange={(value) => applyFilter('country', value === 'any' ? '' : value)}>
                      <SelectTrigger aria-label="Country or worldwide"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Worldwide</SelectItem>
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>{countryLabel(country.code)} ({country.count})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
                    <Select value={filters.category || 'any'} onValueChange={(v) => applyFilter('category', v === 'any' ? '' : v)}>
                      <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">All categories</SelectItem>
                        {(home?.categories ?? categories).map((c) => (
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
                      placeholder="e.g. Accra, London, Tokyo"
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
                        <SelectItem value="ONLINE">Join from anywhere (online + hybrid)</SelectItem>
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
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Ask-iEventPlux: natural-language search over the real catalogue */}
        <div className="mb-8">
          <AiSearchPanel />
        </div>

        {/* Sponsored placements (labelled) — compact native-ad style promo rows */}
        {!browsing && sponsoredEvents.length > 0 && (
          <section className="mb-8" aria-label="Sponsored events">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-lg font-bold">Promoted for you</h2>
              <Badge variant="secondary" className="text-[10px]">Sponsored</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sponsoredEvents.map((s, i) => (
                <SponsoredCard key={s.event.id} event={s.event} index={i} />
              ))}
            </div>
          </section>
        )}

        {browsing ? (
          <section aria-label="Search results" aria-busy={loading}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold">
                {isSearch && searchQuery ? `Results for “${searchQuery}”` : browseAll && !filters.category && !filters.country && !filters.q ? 'Events worldwide' : 'Browse events'}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground" aria-live="polite">{items?.length ?? 0} of {total} events</p>
                <Button variant="ghost" size="sm" className="rounded-full" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" aria-hidden /> Reset
                </Button>
              </div>
            </div>
            {filters.when && filters.when !== 'LIVE_NOW' && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe2 className="size-3.5" aria-hidden />
                Date filters use your local timezone: {attendeeTimeZone.replaceAll('_', ' ')}.
              </p>
            )}
            {listError && (
              <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-foreground">
                <span>{listError}</span>
                <Button size="sm" variant="outline" onClick={() => setRetryKey((value) => value + 1)}>Retry</Button>
              </div>
            )}
            {loading && !items?.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)}
              </div>
            ) : items && items.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
                {items.length < total && (
                  <div className="mt-7 text-center">
                    <Button variant="outline" size="lg" className="rounded-full px-6" disabled={loading} onClick={() => setPage((p) => p + 1)}>
                      {loading ? 'Loading more events…' : 'Load more events'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="No events match those filters"
                description="Try another country, online format, category or date — or clear the filters to see everything."
                action={<Button className="mt-2 rounded-full" onClick={clearFilters}>Clear filters</Button>}
              />
            )}
          </section>
        ) : (
          <>
            {user && <ForYouRail />}
            {home?.liveNow && home.liveNow.length > 0 && (
              <section className="mb-8" aria-label="Live now">
                <div className="mb-3 flex items-center gap-2">
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {home.liveNow.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            {home?.featured && home.featured.length > 0 && (
              <section className="mb-8" aria-label="Featured events">
                <div className="mb-3 flex items-center justify-between">
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {home.featured.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              </section>
            )}
            <section className="mb-8" aria-label="Upcoming events">
              <div className="mb-3 flex items-center justify-between">
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
              {homeError ? (
                <div role="alert" className="ievx-surface flex flex-col items-center gap-3 p-8 text-center">
                  <p className="font-semibold">Upcoming events could not be loaded</p>
                  <p className="text-sm text-muted-foreground">Check your connection and retry.</p>
                  <Button variant="outline" className="rounded-full" onClick={() => setHomeRetry((value) => value + 1)}>Try again</Button>
                </div>
              ) : home === null ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)}
                </div>
              ) : home.upcoming.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {home.upcoming.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                </div>
              ) : (
                <EmptyState title="No upcoming events yet" description="Check back soon — organizers are preparing their next gatherings." />
              )}
            </section>

            {/* How it works — reassurance for first-time buyers */}
            <section className="mb-8" aria-label="How it works">
              <div className="mb-3 flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-bold">How iEventPlux works</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <div key={step.title} className="rounded-2xl border border-border/60 bg-card p-4 ievx-card-hover">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <step.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Step {i + 1}</span>
                    </div>
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Organizer CTA — the two-sided marketplace, made explicit */}
            <section aria-label="For organizers" className="mb-4">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-emerald-700 p-6 text-primary-foreground sm:p-8">
                <Building2 className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-10" aria-hidden />
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

      {/* AI weekend planner — day-by-day itinerary from the live catalogue */}
      <PlannerPanel
        open={plannerOpen}
        onOpenChange={setPlannerOpen}
        cities={home?.cities ?? []}
        categories={(home?.categories ?? categories).map((c) => ({ slug: c.slug, name: c.name }))}
      />
    </div>
  )
}
