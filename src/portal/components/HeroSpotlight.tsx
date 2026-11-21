'use client'

import { useState } from 'react'
import { ArrowUpRight, CalendarDays, MapPin, Radio, ShieldCheck } from 'lucide-react'
import { dateShort } from '../format'
import { priceLabel, type EventCardData } from './EventCard'

/** Genuine editorial spotlight powered by a real published event — not a mock ad. */
export function HeroSpotlight({ event, compact = false }: { event: EventCardData; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const canShowImage = Boolean(event.coverImageUrl && !imageFailed)
  return (
    <a
      href={'#/event/' + encodeURIComponent(event.slug)}
      aria-label={'Explore featured event: ' + event.title}
      className={`ievx-hero-spotlight group relative flex h-full w-full flex-col justify-end overflow-hidden rounded-2xl text-left text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#a8efd7] ${compact ? 'min-h-[190px]' : 'min-h-64'}`}
    >
      {canShowImage ? (
        <img
          src={event.coverImageUrl!}
          alt=""
          loading="eager"
          fetchPriority="high"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_20%,#339989_0%,transparent_45%),linear-gradient(135deg,#114b52,#071a2c)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#061b28]/95 via-[#061b28]/45 to-[#061b28]/5" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
        <span className="rounded-full border border-white/25 bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.13em] text-white backdrop-blur">
          Featured event
        </span>
        <span className="grid size-10 place-items-center rounded-full border border-white/40 bg-white/15 transition-colors group-hover:bg-white/30" aria-hidden>
          <ArrowUpRight className="size-5" />
        </span>
      </div>
      <div className={compact ? "relative z-10 space-y-1.5 p-3.5" : "relative z-10 space-y-2.5 p-4 sm:p-6"}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/90">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{dateShort(event.startsAt)}</span>
          {event.status === 'LIVE' && <span className="inline-flex items-center gap-1 text-[#a8efd7]"><Radio className="size-3.5" aria-hidden />Live now</span>}
        </div>
        <h2 className={compact ? "line-clamp-2 text-[17px] font-extrabold leading-tight tracking-tight" : "line-clamp-2 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl"}>{event.title}</h2>
        <p className="flex items-center gap-1.5 text-xs text-white/85">
          {event.org?.verifiedAt ? <ShieldCheck className="size-3.5 shrink-0 text-[#a8efd7]" aria-hidden /> : <MapPin className="size-3.5 shrink-0" aria-hidden />}
          <span className="min-w-0 truncate">{event.org?.name || (event.city ? event.city : 'Explore the event')}</span>
        </p>
        <div className="flex items-center justify-between border-t border-white/20 pt-3">
          <span className="text-xs font-semibold text-white/85">View details &amp; tickets</span>
          <span className="text-sm font-extrabold text-[#b6f4dc]">{priceLabel(event)}</span>
        </div>
      </div>
    </a>
  )
}
