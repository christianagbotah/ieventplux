'use client'

import { useCallback, useMemo, useState } from 'react'
import { BadgeCheck, CalendarCheck, Download, MapPin, Minus, Plus, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { api } from '../api'
import { navigate } from '../router'
import { money, moneyFromCedis, timeRange } from '../format'
import { EmptyState, type EventCardData } from './EventCard'

/**
 * AI Weekend Planner: a window + city + budget + party size + interests →
 * day-by-day itinerary built ONLY from real catalogue events (server validates
 * every LLM pick against the database). Budget math is honest: estimates use
 * the cheapest live ticket, and degradation is labelled.
 */

interface PlannerPick { event: EventCardData; reason: string; estMinor: number; soldOut: boolean }
interface PlannerResponse {
  summary: string
  degraded: boolean
  note: string | null
  budgetNote: string | null
  window: { kind: string; label: string; start: string; end: string }
  partySize: number
  budgetMinor: number | null
  estPerPersonMinor: number
  estTotalMinor: number
  days: { date: string; picks: PlannerPick[] }[]
  empty: boolean
}

const ANY = '__any'
const WINDOWS = [
  { value: 'THIS_WEEKEND', label: 'This weekend' },
  { value: 'NEXT_WEEKEND', label: 'Next weekend' },
  { value: 'NEXT_7_DAYS', label: 'Next 7 days' },
]

function dayLabel(date: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${date}T00:00:00Z`))
  } catch {
    return date
  }
}

/** RFC 5545 escaping for ICS text values. */
function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function downloadPlanIcs(result: PlannerResponse) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//iEventPlux//AI Planner//EN', 'CALSCALE:GREGORIAN']
  for (const day of result.days) {
    for (const pick of day.picks) {
      const start = new Date(pick.event.startsAt)
      const end = pick.event.endsAt ? new Date(pick.event.endsAt) : new Date(start.getTime() + 2 * 3600_000)
      const eventLines = [
        'BEGIN:VEVENT',
        `UID:${pick.event.id}-plan@ieventplux`,
        `DTSTAMP:${icsStamp(new Date())}`,
        `DTSTART:${icsStamp(start)}`,
        `DTEND:${icsStamp(end)}`,
        `SUMMARY:${icsEscape(pick.event.title)}`,
        pick.event.city ? `LOCATION:${icsEscape(pick.event.city)}` : '',
        `DESCRIPTION:${icsEscape(`${pick.reason} — planned with the iEventPlux AI planner.`)}`,
        `URL:${typeof window !== 'undefined' ? window.location.origin : ''}/#/event/${pick.event.slug}`,
        'END:VEVENT',
      ].filter(Boolean)
      lines.push(...eventLines)
    }
  }
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'ieventplux-plan.ics'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function PlannerPanel({
  open,
  onOpenChange,
  cities,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cities: string[]
  categories: { slug: string; name: string }[]
}) {
  const { toast } = useToast()
  const [phase, setPhase] = useState<'form' | 'loading' | 'done' | 'error'>('form')
  const [win, setWin] = useState('THIS_WEEKEND')
  const [city, setCity] = useState<string>(ANY)
  const [party, setParty] = useState(2)
  const [budget, setBudget] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [result, setResult] = useState<PlannerResponse | null>(null)
  const [error, setError] = useState('')

  const toggleInterest = (slug: string) => {
    setInterests((prev) => (prev.includes(slug) ? prev.filter((i) => i !== slug) : prev.length >= 3 ? prev : [...prev, slug]))
  }

  const runPlanner = useCallback(async () => {
    setPhase('loading')
    setError('')
    const budgetCedis = Number(budget)
    try {
      const data = await api.post<PlannerResponse>('/ai/planner', {
        window: win,
        city: city === ANY ? undefined : city || undefined,
        partySize: party,
        budgetMinor: Number.isFinite(budgetCedis) && budgetCedis > 0 ? moneyFromCedis(budgetCedis) : undefined,
        interests: interests.length ? interests : undefined,
      })
      setResult(data)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The planner is unavailable right now. Please try again.')
      setPhase('error')
    }
  }, [win, city, party, budget, interests])

  const budgetPct = useMemo(() => {
    if (!result || !result.budgetMinor) return null
    return Math.min(100, Math.round((result.estTotalMinor / result.budgetMinor) * 100))
  }, [result])

  const overBudget = Boolean(result?.budgetMinor && result.estTotalMinor > result.budgetMinor)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="planner-sheet w-full overflow-y-auto p-0 sm:max-w-[440px]">
        <SheetHeader className="sr-only p-0">
          <SheetTitle>AI weekend planner</SheetTitle>
          <SheetDescription>Build a day-by-day event itinerary from the live catalogue.</SheetDescription>
        </SheetHeader>

        {/* Aurora hero — the planner's stage */}
        <div className="efx-aurora-bg" style={{ borderRadius: 0, minHeight: 208, padding: '1.7rem 1.4rem' }}>
          {/* Soft transition into the panel body (the aurora edge would otherwise cut hard against the sheet background) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-background" aria-hidden />
          <div className="efx-aurora-bg__content">
            <span className="efx-aurora-bg__kicker">AI ITINERARY · LIVE CATALOGUE</span>
            <h2 className="efx-animated-gradient-text iefx-headline" style={{ fontSize: 'clamp(1.55rem, 5vw, 2rem)' }}>
              Plan your days.
            </h2>
            <p className="efx-aurora-bg__meta" style={{ marginTop: '0.55rem', maxWidth: '26rem' }}>
              Tell iEventPlux when, where and how much — it drafts a day-by-day schedule from the live catalogue
              with real ticket prices and a downloadable calendar file.
            </p>
          </div>
        </div>

        {phase === 'form' && (
          <section className="space-y-5 px-4 py-5" aria-label="Planner settings">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
              <div className="flex flex-wrap gap-1.5">
                {WINDOWS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => setWin(w.value)}
                    aria-pressed={win === w.value}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ievx-press ${
                      win === w.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">City</p>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="rounded-full" aria-label="Pick a city">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Anywhere in Ghana</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Party size</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Remove one person" onClick={() => setParty((p) => Math.max(1, p - 1))}>
                    <Minus className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="w-10 text-center text-sm font-bold tabular-nums" aria-live="polite">{party}</span>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Add one person" onClick={() => setParty((p) => Math.min(12, p + 1))}>
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="efx-floating-label-input min-w-40 flex-1" style={{ margin: 0 }}>
                <input
                  id="planner-budget"
                  className="efx-floating-label-input__field"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={10}
                  placeholder=" "
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
                <label className="efx-floating-label-input__label" htmlFor="planner-budget">Budget for all tickets (₵)</label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interests (up to 3)</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => toggleInterest(c.slug)}
                    aria-pressed={interests.includes(c.slug)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ievx-press ${
                      interests.includes(c.slug) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="efx-shine-sweep-button w-full"
              style={{ justifyContent: 'center', fontSize: '0.95rem' }}
              onClick={() => void runPlanner()}
            >
              <Wand2 className="h-4 w-4" aria-hidden /> Build my plan
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              Picks come only from the live catalogue. Estimates use each event&apos;s cheapest live ticket.
            </p>
          </section>
        )}

        {phase === 'loading' && (
          <section className="px-4 py-10" aria-live="polite">
            <div className="efx-dual-ring-loader" role="status" aria-label="Drafting your itinerary" />
            <p className="efx-dual-ring-loader__label">Reading the catalogue and drafting your itinerary…</p>
          </section>
        )}

        {phase === 'error' && (
          <section className="px-4 py-6">
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
            <Button variant="outline" className="mt-3 rounded-full" onClick={() => setPhase('form')}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Back to settings
            </Button>
          </section>
        )}

        {phase === 'done' && result && (
          <section className="space-y-5 px-4 py-5" aria-live="polite" aria-label="Your itinerary">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="flex items-start gap-2 text-sm">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="font-medium">{result.summary}</span>
              </p>
              {result.degraded && result.note && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">{result.note}</p>
              )}
            </div>

            {(result.estTotalMinor > 0 || result.budgetMinor) && (
              <div className="efx-progress-stripes-loader" style={{ maxWidth: 'none', margin: 0 }} role="status" aria-label="Estimated ticket budget">
                <div className="efx-progress-stripes-loader__track">
                  <div
                    className="efx-progress-stripes-loader__bar"
                    style={{
                      width: `${budgetPct ?? 100}%`,
                      ...(overBudget ? { background: 'repeating-linear-gradient(45deg, #d97706 0 12px, #fbbf24 12px 24px)' } : {}),
                    }}
                  />
                </div>
                <div className="efx-progress-stripes-loader__meta">
                  <span>Est. {money(result.estTotalMinor)} for {result.partySize} {result.partySize === 1 ? 'person' : 'people'}</span>
                  <span>{result.budgetMinor ? `Budget ${money(result.budgetMinor)}` : `Per person ${money(result.estPerPersonMinor)}`}</span>
                </div>
              </div>
            )}
            {result.budgetNote && (
              <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                {result.budgetNote}
              </p>
            )}

            {result.days.length === 0 ? (
              <EmptyState
                title="Nothing on the catalogue in that window"
                description="Try a wider window (next 7 days), drop the city filter, or check back — organizers publish new events daily."
                action={
                  <Button variant="outline" className="rounded-full" onClick={() => setPhase('form')}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Adjust settings
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                {result.days.map((day) => (
                  <div key={day.date}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="efx-animated-gradient-text iefx-subhead" style={{ fontSize: '1.1rem' }}>{dayLabel(day.date)}</span>
                      <Badge variant="secondary" className="text-[10px]">{day.picks.length} pick{day.picks.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="space-y-2.5">
                      {day.picks.map((pick) => (
                        <button
                          key={pick.event.id}
                          type="button"
                          className="flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left ievx-card-hover"
                          onClick={() => navigate(`/event/${pick.event.slug}`)}
                        >
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                            {pick.event.coverImageUrl ? (
                              <img src={pick.event.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center"><CalendarCheck className="h-5 w-5 text-muted-foreground" aria-hidden /></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">
                                {timeRange(pick.event.startsAt, pick.event.endsAt ?? pick.event.startsAt)}
                              </span>
                              {pick.event.city && (
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{pick.event.city}</span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 font-semibold leading-snug">{pick.event.title}</p>
                            {pick.event.org?.name && <p className="text-xs text-muted-foreground">{pick.event.org.name}</p>}
                            <p className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground">
                              <Sparkles className="mr-1 inline h-3 w-3 text-primary" aria-hidden />{pick.reason}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="text-sm font-bold text-primary">{pick.estMinor === 0 ? 'Free' : money(pick.estMinor)}</span>
                            {pick.soldOut && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <BadgeCheck className="h-3 w-3" aria-hidden /> Sold out · waitlist
                              </Badge>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.days.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    downloadPlanIcs(result)
                    toast({ title: 'Calendar file ready', description: 'ieventplux-plan.ics downloaded — open it to save these events.' })
                  }}
                >
                  <Download className="h-4 w-4" aria-hidden /> Download plan (.ics)
                </Button>
                <Button variant="ghost" className="rounded-full" onClick={() => setPhase('form')}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Adjust and re-plan
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Estimates use the cheapest live ticket per event — your final price is confirmed at checkout.
                </p>
              </div>
            )}
          </section>
        )}
      </SheetContent>
    </Sheet>
  )
}
