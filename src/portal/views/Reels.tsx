'use client'

import { useEffect, useRef, useState } from 'react'
import { Heart, MessageCircle, Play, Share2, ArrowRight, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { money, relative } from '../format'

interface Clip {
  id: string
  url: string
  posterUrl: string
  caption?: string | null
  durationSec?: number | null
  event: { id: string; title: string; slug: string; startsAt: string; org: { name: string }; ticketTypes: { priceMinor: number }[] }
  nextEvent: { id: string; title: string; slug: string } | null
  org: { name: string; slug: string }
  views: number
}

/**
 * Short-video event feed. Development media is synthetic (poster-based animated
 * clips — see docs/PROVIDER_CAPABILITIES.md); the feed, reactions and
 * previous-event → next-occurrence linking are real.
 */
export default function Reels() {
  const { user } = usePortal()
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [active, setActive] = useState(0)
  const [reacted, setReacted] = useState<Record<string, boolean>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api
      .get<{ clips: Clip[] }>('/discovery/reels')
      .then((data) => setClips(data.clips))
      .catch(() => setClips([]))
  }, [])

  const react = async (clip: Clip) => {
    if (!user) return navigate('/signin')
    if (reacted[clip.id]) return
    setReacted((r) => ({ ...r, [clip.id]: true }))
    await api.post('/social/reaction', { targetType: 'MEDIA', targetId: clip.id, kind: 'HEART' }).catch(() => {})
  }

  const share = async (clip: Clip) => {
    const url = `${window.location.origin}/#/event/${clip.event.slug}`
    try {
      if (navigator.share) await navigator.share({ title: clip.event.title, url })
      else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      /* cancelled */
    }
  }

  if (clips === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="ievx-skeleton mb-4 h-[70vh] rounded-3xl" />)}
      </div>
    )
  }

  if (clips.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold">No clips yet</p>
        <p className="mt-2 text-sm text-muted-foreground">Organizer clips from past events will appear here.</p>
        <Button className="mt-4 rounded-full" onClick={() => navigate('/')}>Discover events</Button>
      </div>
    )
  }

  const clip = clips[Math.min(active, clips.length - 1)]

  return (
    <div ref={containerRef} className="ievx-reel-snap ievx-scrollbar mx-auto h-[calc(100vh-4rem-4rem)] max-w-md snap-y overflow-y-auto md:h-[calc(100vh-4rem)]" role="feed" aria-label="Event clips feed">
      {clips.map((c, i) => (
        <article key={c.id} className="relative mb-3 h-[calc(100vh-9rem)] snap-start overflow-hidden rounded-3xl bg-black md:h-[calc(100vh-6.5rem)]">
          {/* Synthetic animated clip: ken-burns poster + overlay */}
          <div className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.posterUrl} alt="" className="h-full w-full animate-[ievx-float_8s_ease-in-out_infinite] object-cover opacity-90" style={{ animation: 'kenburns 14s ease-in-out infinite alternate' }} />
            <style>{`@keyframes kenburns { from { transform: scale(1) translateY(0); } to { transform: scale(1.12) translateY(-2%); } }`}</style>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
          </div>

          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur transition hover:bg-white/20"
            aria-label="Play clip"
            onClick={() => void react(c)}
          >
            <Play className="h-6 w-6 fill-white" aria-hidden />
          </button>

          {/* Bottom info */}
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 pb-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{c.org.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{c.org.name}</p>
                <p className="text-[11px] text-white/70">{c.views.toLocaleString()} views · {relative(c.event.startsAt)}</p>
              </div>
              <Badge className="ml-auto border-white/25 bg-white/10 text-white backdrop-blur">{c.durationSec ?? 30}s</Badge>
            </div>
            {c.caption && <p className="text-sm font-medium text-white/95">{c.caption}</p>}
            <p className="text-xs text-white/80">From “{c.event.title}”</p>
            <div className="flex items-center gap-4 pt-1">
              <button className="flex items-center gap-1.5 text-white/90 hover:text-white" onClick={() => void react(c)} aria-label="Love this clip">
                <Heart className={`h-6 w-6 ${reacted[c.id] ? 'fill-rose-500 text-rose-500' : ''}`} aria-hidden />
                {reacted[c.id] ? 'Loved' : 'Love'}
              </button>
              <button className="flex items-center gap-1.5 text-white/90 hover:text-white" onClick={() => navigate(`/event/${c.event.slug}`)} aria-label="Open event">
                <MessageCircle className="h-6 w-6" aria-hidden /> Event
              </button>
              <button className="flex items-center gap-1.5 text-white/90 hover:text-white" onClick={() => void share(c)} aria-label="Share clip">
                <Share2 className="h-6 w-6" aria-hidden /> Share
              </button>
            </div>
            {/* Previous-event media → next occurrence */}
            {c.nextEvent && (
              <button
                className="flex w-full items-center justify-between rounded-2xl bg-white/12 px-4 py-3 text-left backdrop-blur transition hover:bg-white/20"
                onClick={() => navigate(`/event/${c.nextEvent!.slug}`)}
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Next occurrence</p>
                  <p className="truncate text-sm font-semibold text-white">{c.nextEvent.title}</p>
                </div>
                <ArrowRight className="ml-2 h-5 w-5 shrink-0 text-white" aria-hidden />
              </button>
            )}
            {!c.nextEvent && (
              <Button className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold" onClick={() => navigate(`/event/${c.event.slug}`)}>
                {c.event.ticketTypes.some((t) => t.priceMinor > 0) ? `Get tickets · from ${money(Math.min(...c.event.ticketTypes.map((t) => t.priceMinor)))}` : 'Free RSVP'}
              </Button>
            )}
          </div>
        </article>
      ))}

      {/* Nav dots */}
      <div className="sticky bottom-3 flex justify-center gap-1.5 pb-3">
        {clips.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to clip ${i + 1}`}
            onClick={() => {
              setActive(i)
              containerRef.current?.scrollTo({ top: i * (containerRef.current.scrollHeight / clips.length), behavior: 'smooth' })
            }}
            className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`}
          />
        ))}
      </div>
      <p className="pb-3 text-center text-[10px] text-muted-foreground">
        <Volume2 className="mr-1 inline h-3 w-3" aria-hidden />
        Clips are synthetic development media (licensed artwork renders) — reactions, links and feeds are live.
      </p>
    </div>
  )
}
