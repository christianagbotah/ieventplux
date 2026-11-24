'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { relative } from '../format'
import { publishedReelVideoSrc } from '../lib/reel-media'
import { ReelPlayableMedia } from '../components/ReelPlayableMedia'

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

/** Published MP4 files play as native browser video; poster-only previews stay static.
 * All data comes from the server's public READY-only Reels feed, never mock clips.
 */
export default function Reels() {
  const { user } = usePortal()
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [active, setActive] = useState(0)
  const [reacted, setReacted] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pageVisible,setPageVisible] = useState(true)
  const [reactionError,setReactionError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api
      .get<{ clips: Clip[] }>('/discovery/reels')
      .then((data) => setClips(data.clips))
      .catch(() => setClips([]))
  }, [])

  // A visible card only plays while the Reels tab has browser focus. The
  // intersection root is this feed, not the global page or another screen.
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible')
    onVisibility()
    document.addEventListener('visibilitychange',onVisibility)
    return () => document.removeEventListener('visibilitychange',onVisibility)
  },[])

  useEffect(() => {
    const root=containerRef.current
    if (!root || !clips?.length || typeof IntersectionObserver==='undefined') return
    const ratios=new Map<number,number>()
    const observer=new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index=Number((entry.target as HTMLElement).dataset.reelIndex)
        if (Number.isSafeInteger(index) && index>=0)
          ratios.set(index,entry.isIntersecting ? entry.intersectionRatio : 0)
      }
      // A small sliver at the edge of the feed must not start playback.
      const best=[...ratios.entries()].sort((a,b)=>b[1]-a[1])[0]
      setActive(best && best[1]>=0.65 ? best[0] : -1)
    }, {root,threshold:[0.3,0.65,0.9]})
    root.querySelectorAll<HTMLElement>('[data-reel-index]').forEach((node)=>observer.observe(node))
    return ()=>observer.disconnect()
  },[clips])

  const react = async (clip: Clip) => {
    if (!user) return navigate('/signin')
    if (reacted[clip.id]) return
    setReactionError('')
    setReacted((r) => ({ ...r, [clip.id]: true }))
    try { await api.post('/social/reaction', { targetType: 'MEDIA', targetId: clip.id, kind: 'HEART' }) }
    catch {setReacted((r) => ({ ...r, [clip.id]: false }));setReactionError('Could not save your reaction. Please try again.') }
  }

  const share = async (clip: Clip) => {
    const url = `${window.location.origin}/#/event/${clip.event.slug}`
    try {
      if (navigator.share) await navigator.share({ title: clip.event.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopiedId(clip.id)
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
        <article key={c.id} data-reel-index={i} className="relative mb-3 h-[calc(100vh-9rem)] snap-start overflow-hidden rounded-3xl bg-black md:h-[calc(100vh-6.5rem)]">
          <div className="absolute inset-0 overflow-hidden">
            <ReelPlayableMedia src={c.url} posterUrl={c.posterUrl} title={c.event.title}
              active={i===active} pageVisible={pageVisible} />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
          </div>

          {/* Clips without a verified playable stream show an event preview.
              Never present a like/reaction action as a working Play button. */}
          <button
            className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
            aria-label="Open event from preview"
            onClick={() => navigate('/event/' + c.event.slug)}
          >
            Open event <ArrowRight className="size-4" aria-hidden />
          </button>

          {/* Bottom info */}
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 pb-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{c.org.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0, 0, 0, 0.55)' }}>{c.org.name}</p>
                <p className="text-[11px] text-white/70">{publishedReelVideoSrc(c.url) ? 'Video moment' : 'Event preview'} · {relative(c.event.startsAt)}</p>
              </div>
              <Badge className="ml-auto border-white/25 bg-white/10 text-white backdrop-blur">{publishedReelVideoSrc(c.url)?'Video':'Preview'}</Badge>
            </div>
            {c.caption && <p className="text-sm font-medium text-white/95">{c.caption}</p>}
            <p className="text-xs text-white/80">From “{c.event.title}”</p>
            <div className="flex items-center gap-4 pt-1">
              <label className="efx-heart-burst-toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  className="efx-heart-burst-toggle__input"
                  checked={!!reacted[c.id]}
                  onChange={() => void react(c)}
                  aria-label="Like this reel"
                />
                <span className="efx-heart-burst-toggle__stack">
                  <span className="efx-heart-burst-toggle__burst" aria-hidden />
                  <span className="efx-heart-burst-toggle__ring" aria-hidden />
                  <svg className="efx-heart-burst-toggle__heart" viewBox="0 0 24 24" aria-hidden>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </span>
                <span className="efx-heart-burst-toggle__text" style={{ color: '#ffffff' }}>
                  {reacted[c.id] ? 'Loved' : 'Love'}
                </span>
              </label>
              <button className="flex items-center gap-1.5 text-white/90 hover:text-white" onClick={() => navigate(`/event/${c.event.slug}`)} aria-label="Open event">
                <MessageCircle className="h-6 w-6" aria-hidden /> Event
              </button>
              <label
                className="efx-copy-success-checkmark"
                style={{ margin: 0 }}
              >
                <input
                  type="checkbox"
                  className="efx-copy-success-checkmark__input"
                  checked={copiedId === c.id}
                  onChange={() => {}}
                  onClick={(e) => {
                    e.preventDefault()
                    void share(c)
                  }}
                  aria-label="Share clip"
                />
                <span
                  className="efx-copy-success-checkmark__button"
                  style={
                    copiedId === c.id
                      ? { fontSize: '0.8rem', padding: '0.5rem 0.9rem', borderColor: '#10b981', background: 'rgba(16, 185, 139, 0.3)', color: '#ffffff' }
                      : { fontSize: '0.8rem', padding: '0.5rem 0.9rem', borderColor: 'rgba(255, 255, 255, 0.35)', background: 'rgba(255, 255, 255, 0.12)', color: '#ffffff', backdropFilter: 'blur(6px)' }
                  }
                >
                  <span
                    className="efx-copy-success-checkmark__badge"
                    aria-hidden
                    style={
                      copiedId === c.id
                        ? { background: '#10b981', borderColor: '#059669', color: '#ffffff' }
                        : { background: 'rgba(255, 255, 255, 0.16)', borderColor: 'rgba(255, 255, 255, 0.35)', color: '#ffffff' }
                    }
                  >
                    <svg className="efx-copy-success-checkmark__icon" viewBox="0 0 24 24" aria-hidden>
                      <path className="efx-copy-success-checkmark__path" d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span className="efx-copy-success-checkmark__text">
                    <span className="efx-copy-success-checkmark__text-copy">Share</span>
                    <span className="efx-copy-success-checkmark__text-done" style={{ color: '#ffffff' }}>Copied!</span>
                  </span>
                </span>
              </label>
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
              <Button className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold" onClick={() => navigate('/event/' + c.event.slug)}>
                View event and ticket options
              </Button>
            )}
          </div>
        </article>
      ))}

      {reactionError && <p role="alert" className="mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">{reactionError}</p>}

      {/* Nav dots */}
      <div className="sticky bottom-3 flex justify-center gap-1.5 pb-3">
        {clips.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to clip ${i + 1}`}
            onClick={() => {
              containerRef.current?.scrollTo({ top: i * (containerRef.current.scrollHeight / clips.length), behavior: 'smooth' })
            }}
            className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`}
          />
        ))}
      </div>
      <p className="pb-3 text-center text-[10px] text-muted-foreground">
        Verified published MP4 clips can play here. Other event cards remain artwork previews until a real approved video is available. Open an event for tickets and live access.
      </p>
    </div>
  )
}
