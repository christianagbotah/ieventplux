'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wand2, SendHorizonal, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '../api'
import { EventCard, EventCardSkeleton, EmptyState, type EventCardData } from './EventCard'

/**
 * Ask-iEventPlux search: natural-language query → AI-parsed filters → REAL
 * database results. The AI summary is labelled; results are the same shape as
 * the regular discovery list (no fabricated events).
 */

interface SearchResponse {
  summary: string
  filters: { category?: string | null; city?: string | null; mode?: string | null; price?: string | null; when?: string | null; keywords?: string | null }
  items: EventCardData[]
  total: number
}

const EXAMPLES = [
  'Free church services in Accra',
  'Concerts in Accra',
  'Free workshops in Tema',
  'Paid conferences this month',
]

const FILTER_LABELS: Record<string, string> = {
  mode: 'Format',
  price: 'Price',
  when: 'When',
  category: 'Category',
  city: 'City',
  keywords: 'Keywords',
}

const FILTER_VALUES: Record<string, string> = {
  PHYSICAL: 'In person',
  VIRTUAL: 'Online',
  HYBRID: 'Hybrid',
  FREE: 'Free',
  PAID: 'Paid',
  TODAY: 'Today',
  THIS_WEEK: 'This week',
  THIS_WEEKEND: 'This weekend',
}

export function AiSearchPanel({ id }: { id?: string }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState('')

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 3) return
    setState('loading')
    setError('')
    try {
      const data = await api.post<SearchResponse>('/ai/search', { query: trimmed })
      setResult(data)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI search is unavailable right now.')
      setState('error')
    }
  }, [])

  const reset = () => {
    setQuery('')
    setResult(null)
    setError('')
    setState('idle')
  }

  // Deep link support: /#ai-search&aiq=...
  useEffect(() => {
    const hash = window.location.hash
    const match = hash.match(/aiq=([^&]+)/)
    if (match) {
      const q = decodeURIComponent(match[1])
      setQuery(q)
      void runSearch(q)
    }
  }, [runSearch])

  const filterChips = result
    ? Object.entries(result.filters).filter(([, v]) => Boolean(v))
    : []

  return (
    <section id={id ?? 'ai-search'} aria-label="AI powered event search" className="ievx-scale scroll-mt-32">
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/10 blur-2xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Wand2 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-bold leading-tight">Ask iEventPlux</h2>
              <p className="text-xs text-muted-foreground">Describe the event you want — AI turns it into filters and searches the real catalogue.</p>
            </div>
            <Badge variant="secondary" className="ml-auto hidden gap-1 sm:inline-flex">
              <Sparkles className="h-3 w-3" aria-hidden /> AI
            </Badge>
          </div>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch(query)
            }}
          >
            <div className="relative flex-1">
              <Wand2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. affordable online workshops for creators this weekend"
                aria-label="Describe the events you are looking for"
                maxLength={300}
                className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="h-11 flex-1 rounded-full sm:flex-none sm:px-6" disabled={state === 'loading' || query.trim().length < 3}>
                {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizonal className="h-4 w-4" aria-hidden />}
                Search with AI
              </Button>
              {state !== 'idle' && (
                <Button type="button" variant="outline" className="h-11 rounded-full" onClick={reset} aria-label="Reset AI search">
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
          </form>

          {state === 'idle' && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Example searches">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex)
                    void runSearch(ex)
                  }}
                  className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary ievx-press"
                >
                  “{ex}”
                </button>
              ))}
            </div>
          )}

          {state === 'error' && (
            <div role="alert" className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {state === 'loading' && (
            <div className="mt-5" aria-live="polite">
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Understanding your request and searching events…
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <EventCardSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {state === 'done' && result && (
            <div className="mt-5" aria-live="polite">
              <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="flex items-start gap-2 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium">{result.summary}</span>
                </p>
                {filterChips.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Applied:</span>
                    {filterChips.map(([key, value]) => (
                      <Badge key={key} variant="outline" className="gap-1 text-[11px] normal-case">
                        {FILTER_LABELS[key] ?? key}: {FILTER_VALUES[String(value)] ?? String(value)}
                        <X
                          className="h-3 w-3 opacity-50"
                          aria-hidden
                          role="img"
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{result.total} matching event{result.total !== 1 ? 's' : ''} from the live catalogue</p>
              {result.items.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {result.items.map((event, i) => (
                    <EventCard key={event.id} event={event} index={i} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Nothing matched that description"
                  description="Try loosening a filter — mention a broader category or drop the date constraint."
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
