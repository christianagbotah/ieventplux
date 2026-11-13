'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Send, Users, Lock, ShieldAlert, ChevronLeft, MessageCircle, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { PlayerSim } from '../components/PlayerSim'
import { initials, relative, humanize, money, dateLong } from '../format'
import { useToast } from '@/hooks/use-toast'

interface ChatRow {
  id: string
  body: string
  createdAt: string
  status?: string
  user: { id: string; displayName: string }
}

interface BroadcastPayload {
  broadcast: {
    id: string
    title: string
    description?: string | null
    accessPolicy: string
    priceMinor?: number | null
    status: string
    recordingStatus: string
    replayPriceMinor?: number | null
    viewerCapacity: number
    minutesUsed?: number
    startedAt?: string | null
    endedAt?: string | null
    event: { id: string; title: string; slug: string; coverImageUrl?: string | null; org: { name: string; slug: string } }
  }
  access: { allowed: boolean; reason?: string; requires?: string }
  replay: { available: boolean; effectivePriceMinor: number | null }
  delivery: 'SYNTHETIC' | 'CLOUDFLARE_STREAM'
  deliveryNote: string
}

export default function BroadcastView({ id }: { id: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const [data, setData] = useState<BroadcastPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [draft, setDraft] = useState('')
  const [viewers, setViewers] = useState(0)
  const [playToken, setPlayToken] = useState<string | null>(null)
  const [playExpiry, setPlayExpiry] = useState<string | null>(null)
  const [roomFull, setRoomFull] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const payload = await api.get<BroadcastPayload>(`/broadcasts/${id}/detail`)
      setData(payload)
      const chat = await api.get<{ items: ChatRow[] }>(`/broadcasts/${id}/chat?pageSize=40`).catch(() => ({ items: [] }))
      setMessages(chat.items)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Broadcast not found.')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  // Start playback when access is allowed (entitlement-checked server-side).
  // Handles live rooms at capacity (ROOM_FULL — retry offered) and replays.
  const startPlayback = useCallback(async () => {
    setRoomFull(null)
    setPlayError(null)
    try {
      const result = await api.post<{ playbackToken: string; expiresAt: string; mode?: 'LIVE' | 'REPLAY' }>(`/broadcasts/${id}/play`)
      setPlayToken(result.playbackToken)
      setPlayExpiry(result.expiresAt)
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'ROOM_FULL') {
        setRoomFull(err.message)
        return
      }
      if (err instanceof ApiClientError) {
        setPlayError(err.message)
        return
      }
      /* entitlement failures are already shown by the access gate */
    }
  }, [id])

  const isReplay = data?.broadcast.status === 'ENDED'
  const replayReady = data?.replay.available ?? false

  useEffect(() => {
    if (!data?.access.allowed || playToken || !user) return
    if (isReplay && !replayReady) return // replay not prepared — panel explains
    void (async () => {
      await startPlayback()
    })()
  }, [data, playToken, user, isReplay, replayReady, startPlayback])

  // Realtime: join the broadcast room for chat + presence.
  useEffect(() => {
    if (!data) return
    const socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'], reconnection: true })
    socket.on('connect', () => socket.emit('join', { room: `broadcast:${id}` }))
    socket.on('chat', (message: ChatRow) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev.slice(-80), message]))
    })
    socket.on('chat:moderated', (payload: { id: string; status: string }) => {
      // Moderator hide/flag/restore lands live: HIDDEN becomes a tombstone,
      // FLAGGED is pulled pending review, VISIBLE restores an in-state row.
      setMessages((prev) => {
        if (payload.status === 'VISIBLE') return prev.map((m) => (m.id === payload.id ? { ...m, status: 'VISIBLE' } : m))
        if (payload.status === 'HIDDEN') return prev.map((m) => (m.id === payload.id ? { ...m, status: 'HIDDEN' } : m))
        return prev.filter((m) => m.id !== payload.id)
      })
    })
    socket.on('presence', (payload: { room: string; viewers: number }) => {
      if (payload.room === `broadcast:${id}`) setViewers(payload.viewers)
    })
    socket.on('typing', (payload: { user: string }) => {
      if (isReplay) return // transcript mode — no typing hints
      // ephemeral typing hint (not persisted)
      const el = document.getElementById('typing-hint')
      if (el) {
        el.textContent = `${payload.user} is typing…`
        el.dataset.until = String(Date.now() + 2500)
      }
    })
    return () => {
      socket.disconnect()
    }
  }, [data, id, isReplay])

  // Session heartbeat keeps the protected playback token alive.
  useEffect(() => {
    if (!playToken) return
    const timer = setInterval(() => {
      void api.post(`/broadcasts/${id}/heartbeat`, { token: playToken }).catch(() => {
        toast({ description: 'Playback session expired — rejoining…', variant: 'destructive' })
        setPlayToken(null)
        void startPlayback()
      })
    }, 60_000)
    return () => clearInterval(timer)
  }, [playToken, id, toast, startPlayback])

  const sendChat = async () => {
    if (!user) return navigate('/signin')
    if (!data || data.broadcast.status !== 'LIVE') return // transcript is read-only
    if (draft.trim().length < 1) return
    // Persistence + authorization via the API; the confirmed message is relayed
    // through the realtime room. The local append is the fallback when the relay
    // is unavailable — the socket handler dedupes by id either way.
    const confirmed = await api.post<{ message: ChatRow }>(`/broadcasts/${id}/chat`, { body: draft }).catch((err) => {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not send the message.', variant: 'destructive' })
      return null
    })
    if (confirmed?.message) {
      setMessages((prev) => (prev.some((m) => m.id === confirmed.message.id) ? prev : [...prev.slice(-80), confirmed.message]))
    }
    setDraft('')
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Lock className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-bold">Broadcast unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-5 rounded-full" onClick={() => navigate('/live')}>Back to Live Now</Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <div className="ievx-skeleton h-[60vh] rounded-2xl" />
      </div>
    )
  }

  const b = data.broadcast

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-full text-muted-foreground" onClick={() => navigate('/live')}>
        <ChevronLeft className="h-4 w-4" /> Live Now
      </Button>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {data.access.allowed ? (
            isReplay && !replayReady ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-black px-6 text-center">
                <History className="h-10 w-10 text-white/60" aria-hidden />
                <p className="max-w-md text-sm text-white/80">This broadcast has ended. The replay is not available yet.</p>
                <Button variant="outline" className="rounded-full" onClick={() => void load()}>Check again</Button>
              </div>
            ) : roomFull ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-black px-6 text-center">
                <Users className="h-10 w-10 text-white/60" aria-hidden />
                <p className="max-w-md text-sm text-white/80">{roomFull}</p>
                <Button className="rounded-full" onClick={() => void startPlayback()}>Try again</Button>
              </div>
            ) : playError ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-black px-6 text-center">
                <ShieldAlert className="h-10 w-10 text-white/60" aria-hidden />
                <p className="max-w-md text-sm text-white/80">{playError}</p>
                <Button variant="outline" className="rounded-full" onClick={() => void startPlayback()}>Retry</Button>
              </div>
            ) : playToken ? (
              <PlayerSim title={b.title} orgName={b.event.org.name} offline={isReplay} className="aspect-video w-full" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black text-white/70">
                <p className="text-sm">Starting secure playback session…</p>
              </div>
            )
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-black px-6 text-center">
              <Lock className="h-10 w-10 text-white/60" aria-hidden />
              <p className="max-w-md text-sm text-white/80">
                {data.access.reason === 'sign_in_required'
                  ? 'Sign in to watch this broadcast.'
                  : isReplay
                    ? `This replay requires ${data.replay.effectivePriceMinor ? `a viewing pass (${money(data.replay.effectivePriceMinor)}) or ` : ''}a ticket that includes online access.`
                    : data.access.requires === 'PAID'
                      ? 'This broadcast requires a paid viewing pass or a ticket that includes online access.'
                      : data.access.requires === 'TICKET_HOLDERS'
                        ? 'This stream is for ticket holders whose ticket includes online access.'
                        : 'Your viewing access is no longer active.'}
              </p>
              {!user ? (
                <Button className="rounded-full" onClick={() => navigate('/signin')}>Sign in</Button>
              ) : (
                <Button className="rounded-full" onClick={() => navigate(`/event/${b.event.slug}`)}>Get access</Button>
              )}
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold sm:text-2xl">{b.title}</h1>
              <span className="relative inline-flex">
                <Badge variant={isReplay ? 'secondary' : 'destructive'} className="capitalize">{isReplay ? 'Replay' : 'Live'}</Badge>
                {!isReplay && <span className="efx-badge-ping__ping" aria-hidden style={{ top: '-3px', right: '-3px', width: '8px', height: '8px' }} />}
              </span>
              <Badge variant="outline" className="capitalize">{humanize(b.accessPolicy)}</Badge>
              {!isReplay && viewers > 0 && (
                <span className="relative inline-flex">
                  <Badge variant={viewers >= b.viewerCapacity ? 'destructive' : 'secondary'} className="gap-1">
                    <Users className="h-3 w-3" /> {viewers} watching · cap {b.viewerCapacity.toLocaleString()}
                  </Badge>
                  <span className="efx-badge-ping__ping" aria-hidden style={{ top: '-3px', right: '-3px', width: '8px', height: '8px' }} />
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {b.event.title} · {b.event.org.name}
              {isReplay && b.endedAt && <span> · recorded {dateLong(b.endedAt)}</span>}
              {isReplay && b.minutesUsed ? <span> · {Math.round(b.minutesUsed)} min</span> : ''}
              {playExpiry && <span className="ml-1">· session renews automatically</span>}
            </p>
            {b.description && <p className="mt-3 text-sm text-foreground/85">{b.description}</p>}
            {data.delivery === 'SYNTHETIC' && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {data.deliveryNote}
              </p>
            )}
          </div>
        </div>

        {/* Live chat (read-only transcript for replays) */}
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card lg:h-auto">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <p className="text-sm font-bold">{isReplay ? 'Chat transcript' : 'Live chat'}</p>
            <span className="text-[11px] text-muted-foreground">{isReplay ? 'read-only' : 'moderated'}</span>
          </div>
          <div ref={chatRef} className="ievx-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="pt-8 text-center text-xs text-muted-foreground">{isReplay ? 'No messages were sent during the live session.' : 'Say hello — messages appear here live.'}</p>}
            {messages.map((m) =>
              m.status === 'HIDDEN' ? (
                <div key={m.id} className="flex gap-2.5 opacity-70">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-secondary text-[10px] font-bold">{initials(m.user.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-none"><span className="font-semibold">{m.user.displayName}</span> <span className="text-muted-foreground">· {relative(m.createdAt)}</span></p>
                    <p className="mt-0.5 text-sm italic leading-snug text-muted-foreground">Message removed by a moderator.</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="iefx-msg-in flex gap-2.5">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-secondary text-[10px] font-bold">{initials(m.user.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-none"><span className="font-semibold">{m.user.displayName}</span> <span className="text-muted-foreground">· {relative(m.createdAt)}</span></p>
                    <p className="mt-0.5 text-sm leading-snug">{m.body}</p>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="border-t border-border/60 p-3">
            {isReplay ? (
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <History className="h-3.5 w-3.5" aria-hidden />
                Chat closed after the live session — the transcript is read-only.
              </p>
            ) : (
              <>
                <p id="typing-hint" className="h-4 text-[11px] text-muted-foreground" aria-live="polite" />
                {user ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void sendChat()
                    }}
                  >
                    <div className="efx-glow-focus-input min-w-0 flex-1" style={{ margin: 0, maxWidth: '100%' }}>
                      <MessageCircle className="efx-glow-focus-input__icon" aria-hidden />
                      <input
                        type="text"
                        className="efx-glow-focus-input__field"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Send a message…"
                        aria-label="Chat message"
                        maxLength={400}
                      />
                    </div>
                    <Button type="submit" size="icon" className="shrink-0 rounded-full ievx-press" aria-label="Send chat message" disabled={!draft.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <Button variant="outline" className="w-full rounded-full" onClick={() => navigate('/signin')}>Sign in to chat</Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
