'use client'

import { useEffect, useState } from 'react'
import { Sparkles, TrendingUp, ArrowRight, Loader2 } from 'lucide-react'
import { api } from '../api'
import { navigate } from '../router'
import { EventCard, EventCardSkeleton, type EventCardData } from './EventCard'

/**
 * "Picked for you" — AI recommendations from the signed-in user's real history
 * (tickets, saves, follows). When personalization is unavailable we honestly
 * label the rail as trending popularity instead of pretending.
 */

interface RecommendResponse {
  items: EventCardData[]
  reasons: Record<string, string>
  degraded: boolean
  note?: string | null
}

export function ForYouRail() {
  const [data, setData] = useState<RecommendResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api
      .post<RecommendResponse>('/ai/recommend')
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return null
  if (!data) {
    return (
      <section className="mb-10" aria-label="Personalized recommendations loading">
        <div className="mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          <h2 className="text-lg font-bold">Finding picks for you…</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }
  if (data.items.length === 0) return null

  return (
    <section className="mb-10" aria-label={data.degraded ? 'Trending events' : 'Personalized recommendations'}>
      <div className="mb-4 flex items-center gap-2">
        {data.degraded ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-lg font-bold">Popular right now</h2>
            <span className="text-xs text-muted-foreground">by real tickets sold</span>
          </>
        ) : (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-lg font-bold">Picked for you</h2>
            <span className="text-xs text-muted-foreground">based on your tickets, saves & follows</span>
          </>
        )}
        <button
          type="button"
          className="efx-underline-slide-link ml-auto"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => navigate('/')}
        >
          More
        </button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.items.map((event, i) => (
          <EventCard
            key={event.id}
            event={event}
            index={i}
            footer={
              !data.degraded && data.reasons[event.id] ? (
                <p className="flex items-start gap-1.5 border-t border-border/50 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                  {data.reasons[event.id]}
                </p>
              ) : undefined
            }
          />
        ))}
      </div>
      <div className="mt-4">
        <button
          type="button"
          className="efx-underline-slide-link"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => navigate('/#ai-search')}
        >
          Ask AI for something specific <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </section>
  )
}
