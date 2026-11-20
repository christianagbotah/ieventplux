'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, ArrowRight, Flag, Play, Pause, Share2, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiClientError } from '../api'
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
 * Play only direct browser-supported files from secure URLs. A poster or
 * unverified streaming endpoint must never masquerade as playable video.
 * Hosted HLS/DASH will require a separately verified signed-player adapter.
 */
export function isDirectPlayableVideo(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://ieventplux.lightworldtech.com')
    return ['https:', 'http:'].includes(parsed.protocol) && /\.(mp4|webm)$/i.test(parsed.pathname)
  } catch {
    return false
  }
}

/** Public event-clip feed. Actual hosted files play when available; synthetic
 * artwork is explicitly labelled as a preview, never a pretend video. */
export default function Reels() {
  const { user } = usePortal()
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [active, setActive] = useState(0)
  const [reacted, setReacted] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [videoFailed, setVideoFailed] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState('')
  const [reportClipId, setReportClipId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('SPAM')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reported, setReported] = useState<Record<string, boolean>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const pendingReactions = useRef(new Set<string>())

  useEffect(() => {
    void api
      .get<{ clips: Clip[] }>('/discovery/reels')
      .then((data) => setClips(data.clips))
      .catch(() => setClips([]))
  }, [])

  // Server state, not a browser-only "liked" animation: refreshes and devices
  // must agree on the current user's real reaction.
  useEffect(() => {
    if (!user?.id || !clips?.length) {
      setReacted({})
      return
    }
    let cancelled = false
    const ids = clips.map((clip) => clip.id).slice(0, 30).join(',')
    void api.get<{ reactions: { targetId: string; kind: string }[] }>('/social/reactions?ids=' + encodeURIComponent(ids))
      .then(({ reactions }) => {
        if (!cancelled) setReacted(Object.fromEntries(reactions.map((r) => [r.targetId, true])))
      })
      .catch(() => { if (!cancelled) setActionError('Unable to load your saved reactions. Try refreshing.') })
    return () => { cancelled = true }
  }, [user?.id, clips])

  const react = async (clip: Clip) => {
    if (!user) return navigate('/signin')
    if (pendingReactions.current.has(clip.id)) return
    pendingReactions.current.add(clip.id)
    const previous = Boolean(reacted[clip.id])
    setReacted((r) => ({ ...r, [clip.id]: !previous }))
    setActionError('')
    try {
      const response = await api.post<{ reacted: boolean }>('/social/reaction', {
        targetType: 'MEDIA', targetId: clip.id, kind: 'HEART',
      })
      setReacted((r) => ({ ...r, [clip.id]: response.reacted }))
    } catch (error) {
      setReacted((r) => ({ ...r, [clip.id]: previous }))
      setActionError(error instanceof ApiClientError ? error.message : 'Could not save your reaction. Try again.')
    } finally {
      pendingReactions.current.delete(clip.id)
    }
  }

  const togglePlayback = async (clip: Clip) => {
    const video = videoRefs.current[clip.id]
    if (!video) return
    if (!video.paused) {
      video.pause()
      setPlayingId(null)
      return
    }
    Object.values(videoRefs.current).forEach((other) => { if (other && other !== video) other.pause() })
    setActionError('')
    try {
      await video.play()
      setPlayingId(clip.id)
    } catch {
      setActionError('This video could not play on your device. Open the event instead.')
    }
  }

  // Off-screen media must not continue consuming bandwidth or playing audio.
  useEffect(() => {
    clips?.forEach((clip, index) => {
      if (index !== active) videoRefs.current[clip.id]?.pause()
    })
    setPlayingId((current) => clips?.[active]?.id === current ? current : null)
  }, [active, clips])

  const submitReport = async () => {
    if (!reportClipId || reportSubmitting) return
    if (!user) { setReportClipId(null); navigate('/signin'); return }
    setReportSubmitting(true)
    setActionError('')
    try {
      await api.post('/social/report', {
        targetType: 'MEDIA', targetId: reportClipId, reason: reportReason, details: reportDetails,
      })
      setReported((before) => ({ ...before, [reportClipId]: true }))
      setReportClipId(null)
      setReportDetails('')
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : 'Could not send the report. Try again.')
    } finally {
      setReportSubmitting(false)
    }
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

  return (
    <div ref={containerRef} className="ievx-reel-snap ievx-scrollbar mx-auto h-[calc(100vh-4rem-4rem)] max-w-md snap-y overflow-y-auto md:h-[calc(100vh-4rem)]" role="feed" aria-label="Event clips feed"
      onScroll={(event) => {
        const viewport = event.currentTarget
        const height = (viewport.firstElementChild as HTMLElement | null)?.offsetHeight ?? viewport.clientHeight
        if (height > 0) setActive(Math.min(clips.length - 1, Math.max(0, Math.round(viewport.scrollTop / (height + 12)))))
      }}>
      {clips.map((c, i) => (
        <article key={c.id} className="relative mb-3 h-[calc(100vh-9rem)] snap-start overflow-hidden rounded-3xl bg-black md:h-[calc(100vh-6.5rem)]">
          <div className="absolute inset-0 overflow-hidden">
            {isDirectPlayableVideo(c.url) && !videoFailed[c.id] ? (
              <video
                ref={(element) => { videoRefs.current[c.id] = element }}
                src={c.url} poster={c.posterUrl || undefined} playsInline
                preload="none" className="h-full w-full object-contain"
                aria-label={`Clip from ${c.event.title}`}
                onEnded={() => setPlayingId(null)}
                onError={() => { setVideoFailed((previous) => ({ ...previous, [c.id]: true })); setPlayingId(null) }}
              />
            ) : c.posterUrl && !isDirectPlayableVideo(c.posterUrl) ? (
              <img src={c.posterUrl} alt="" loading="lazy" className="iefx-kenburns h-full w-full object-cover opacity-90" />
            ) : <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-800 to-black p-8 text-center text-sm text-white/70">Video preview unavailable. Open the event for details.</div>}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
          </div>

          <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
            {isDirectPlayableVideo(c.url) && !videoFailed[c.id] && (
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/80"
                onClick={() => void togglePlayback(c)} aria-label={playingId === c.id ? 'Pause clip' : 'Play clip'}>
                {playingId === c.id ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {playingId === c.id ? 'Pause' : 'Play'}
              </button>
            )}
            <button type="button"
              className="inline-flex items-center justify-center gap-1 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/80"
              aria-label="Open associated event"
              onClick={() => navigate('/event/' + c.event.slug)}>
              Event <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>

          {/* Bottom info */}
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 pb-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{c.org.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0, 0, 0, 0.55)' }}>{c.org.name}</p>
                <p className="text-[11px] text-white/70">Event preview · {relative(c.event.startsAt)}</p>
              </div>
              <Badge className="ml-auto border-white/25 bg-white/10 text-white backdrop-blur">{isDirectPlayableVideo(c.url) && !videoFailed[c.id] ? 'Video' : 'Preview'}</Badge>
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
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white"
                onClick={() => void share(c)} aria-label="Share event clip">
                <Share2 className="size-5" aria-hidden /> {copiedId === c.id ? 'Copied!' : 'Share'}
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
                onClick={() => { setReportClipId(c.id); setActionError('') }} aria-label="Report this clip" disabled={reported[c.id]}>
                <Flag className="size-4" aria-hidden /> {reported[c.id] ? 'Reported' : 'Report'}
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
              <Button className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold" onClick={() => navigate('/event/' + c.event.slug)}>
                View event and ticket options
              </Button>
            )}
          </div>
        </article>
      ))}

      {actionError && <div role="alert" className="mx-3 mb-3 rounded-xl border border-red-400/60 bg-red-950/90 p-3 text-sm text-white">
        {actionError}
        <button type="button" className="ml-3 underline" onClick={() => setActionError('')}>Dismiss</button>
      </div>}

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
        Only actual MP4/WebM uploads have a Play control. Poster-based previews are not videos. Clips play only when you choose.
      </p>
      <Dialog open={reportClipId !== null} onOpenChange={(open) => { if (!open && !reportSubmitting) setReportClipId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report a clip</DialogTitle>
            <DialogDescription>Reports go to the moderation team. Do not include personal details unless needed to explain a safety concern.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-2 text-sm font-medium">Reason
            <select className="w-full rounded-lg border bg-background px-3 py-2" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              <option value="SPAM">Spam</option>
              <option value="OFFENSIVE">Abusive or offensive content</option>
              <option value="FRAUD">Fraud or impersonation</option>
              <option value="COPYRIGHT">Copyright concern</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">More information (optional)
            <textarea className="min-h-20 w-full rounded-lg border bg-background px-3 py-2" maxLength={1000} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
          </label>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <Button className="w-full" disabled={reportSubmitting} onClick={() => void submitReport()}>
            {reportSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />} Submit report
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
