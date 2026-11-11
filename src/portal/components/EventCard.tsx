'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, Monitor, Users, Radio, Ticket } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { navigate } from '../router'
import { money, dateShort, humanize } from '../format'

export interface EventCardData {
  id: string
  slug: string
  title: string
  summary?: string | null
  coverImageUrl?: string | null
  startsAt: string
  endsAt?: string
  city?: string | null
  country?: string
  mode?: string
  status?: string
  categorySlug?: string
  isFeatured?: boolean
  boostedUntil?: string | null
  sponsored?: boolean
  org?: { name: string; slug?: string; verifiedAt?: string | null } | null
  ticketTypes?: { priceMinor: number }[]
}

export function priceLabel(event: EventCardData): string {
  const prices = (event.ticketTypes ?? []).map((t) => t.priceMinor)
  if (prices.length === 0) return '—'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (max === 0) return 'Free'
  if (min === max) return money(min)
  return `From ${money(min)}`
}

export function EventCard({ event, index = 0 }: { event: EventCardData; index?: number }) {
  const [imgFailed, setImgFailed] = useState(false)
  const isLive = event.status === 'LIVE'
  return (
    <Card
      role="article"
      aria-label={event.title}
      className="ievx-card-hover group overflow-hidden rounded-2xl border-border/70 bg-card cursor-pointer"
      style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
      onClick={() => navigate(`/event/${event.slug}`)}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {event.coverImageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImageUrl}
            alt={`${event.title} artwork`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-accent/20 to-primary/5 p-6 text-center">
            <span className="text-lg font-semibold text-foreground/70">{event.title}</span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
              <span className="ievx-live-dot" style={{ background: 'white' }} /> Live
            </span>
          )}
          {event.sponsored && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground shadow">Sponsored</span>
          )}
          {event.isFeatured && !event.sponsored && (
            <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow">Featured</span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 pt-10">
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-white/95">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {dateShort(event.startsAt)}
            {event.city && (
              <>
                <MapPin className="ml-1 h-3.5 w-3.5" aria-hidden />
                {event.city}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 min-h-[2.6em] font-semibold leading-snug group-hover:text-primary">{event.title}</h3>
        {event.org?.name && <p className="text-xs text-muted-foreground">{event.org.name}{event.org.verifiedAt ? ' · Verified' : ''}</p>}
        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="gap-1 text-[11px] capitalize">
            {event.mode === 'VIRTUAL' ? <Monitor className="h-3 w-3" /> : event.mode === 'HYBRID' ? <Radio className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {humanize(event.mode ?? 'Physical')}
          </Badge>
          <span className="text-sm font-bold text-primary">{priceLabel(event)}</span>
        </div>
      </div>
    </Card>
  )
}

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-2xl" aria-hidden>
      <div className="ievx-skeleton aspect-[3/4] w-full" />
      <div className="space-y-2.5 p-4">
        <div className="ievx-skeleton h-4 w-4/5 rounded" />
        <div className="ievx-skeleton h-3 w-2/5 rounded" />
        <div className="ievx-skeleton h-6 w-24 rounded-full" />
      </div>
    </Card>
  )
}

export function EventRow({ event }: { event: EventCardData }) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left ievx-card-hover"
      onClick={() => navigate(`/event/${event.slug}`)}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><Ticket className="h-5 w-5 text-muted-foreground" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{event.title}</p>
        <p className="truncate text-xs text-muted-foreground">{event.org?.name} · {dateShort(event.startsAt)}</p>
      </div>
      <span className="text-sm font-bold text-primary">{priceLabel(event)}</span>
    </button>
  )
}

export function StatsChip({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2">
      {icon}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}
