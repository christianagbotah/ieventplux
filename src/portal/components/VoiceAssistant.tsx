'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Sparkles, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { usePortal } from '../store'

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Real-time voice conversation assistant (ASR → LLM → TTS through the backend).
 * Push-to-talk starts a turn; after the reply plays, listening auto-resumes so
 * the conversation flows hands-free. Barge-in: speaking again while audio plays stops playback.
 */
export function VoiceAssistant() {
  const { assistantOpen, setAssistantOpen, user } = usePortal()
  const [turns, setTurns] = useState<Turn[]>([])
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [micDenied, setMicDenied] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const conversationIdRef = useRef<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setSpeaking(false)
  }, [])

  const sendAudio = useCallback(
    async (blob: Blob) => {
      if (!user) {
        setError('Sign in to talk with the concierge.')
        return
      }
      setProcessing(true)
      setError(null)
      try {
        const form = new FormData()
        form.append('audio', blob, 'turn.webm')
        if (conversationIdRef.current) form.append('conversationId', conversationIdRef.current)
        const result = await api.post<{ transcript: string; reply: string; audioBase64: string | null; audioMime: string | null; conversationId: string | null; note?: string }>('/ai/voice', form)
        conversationIdRef.current = result.conversationId
        const next: Turn[] = []
        if (result.transcript) next.push({ role: 'user', text: result.transcript })
        if (result.reply) next.push({ role: 'assistant', text: result.reply })
        setTurns((prev) => [...prev, ...next])
        if (result.note) setError(result.note)
        if (result.audioBase64) {
          const audio = new Audio(`data:${result.audioMime ?? 'audio/mpeg'};base64,${result.audioBase64}`)
          audioRef.current = audio
          setSpeaking(true)
          audio.onended = () => {
            setSpeaking(false)
            // Hands-free continuation: resume listening after the reply.
            setListening(true)
          }
          void audio.play().catch(() => setSpeaking(false))
        } else {
          setListening(true)
        }
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'The concierge is unavailable right now.')
      } finally {
        setProcessing(false)
      }
    },
    [user]
  )

  const startListening = useCallback(async () => {
    stopAudio()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicDenied(false)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 2000) void sendAudio(blob)
        else setListening(true) // too short — keep listening
      }
      recorder.start(250)
      recorderRef.current = recorder
      setListening(true)
    } catch {
      setMicDenied(true)
      setError('Microphone permission denied. You can still type to the concierge.')
    }
  }, [sendAudio, stopAudio])

  const stopListening = useCallback((submit = true) => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      if (!submit) recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop())
      recorder.stop()
    }
    setListening(false)
  }, [])

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim() || !user) {
        if (!user) setError('Sign in to chat with the concierge.')
        return
      }
      setProcessing(true)
      setError(null)
      setTurns((prev) => [...prev, { role: 'user', text }])
      try {
        const result = await api.post<{ reply: string; conversationId: string }>('/ai/chat', { message: text, conversationId: conversationIdRef.current })
        conversationIdRef.current = result.conversationId
        setTurns((prev) => [...prev, { role: 'assistant', text: result.reply }])
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'The concierge is unavailable right now.')
      } finally {
        setProcessing(false)
      }
    },
    [user]
  )

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, error])

  useEffect(() => () => stopAudio(), [stopAudio])

  if (!assistantOpen) {
    return (
      <button
        aria-label="Open AI voice concierge"
        onClick={() => setAssistantOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 ievx-press md:bottom-6"
      >
        <Sparkles className="h-6 w-6" aria-hidden />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full bg-accent border-2 border-card" />
        </span>
      </button>
    )
  }

  return (
    <div className="fixed inset-x-3 bottom-16 z-40 md:inset-x-auto md:right-5 md:bottom-5 md:w-[400px] ievx-scale" role="dialog" aria-label="AI voice concierge">
      <div className="ievx-glass overflow-hidden rounded-2xl border border-border/70 shadow-2xl">
        <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden />
            <div>
              <p className="text-sm font-semibold leading-none">iEventPlux Concierge</p>
              <p className="text-[11px] opacity-80">Real-time voice · knows today&apos;s events</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-white/15" aria-label="Close concierge" onClick={() => { stopListening(false); stopAudio(); setAssistantOpen(false) }}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={scrollRef} className="ievx-scrollbar max-h-64 min-h-[120px] overflow-y-auto bg-background/70 px-4 py-3">
          {turns.length === 0 && !error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              <div className="flex items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="ievx-voice-bar" style={{ height: `${10 + (i % 3) * 10}px`, animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
              <p className="text-sm font-medium">Tap the mic and ask about events</p>
              <p className="text-xs text-muted-foreground">&ldquo;What gospel events are on this weekend?&rdquo;</p>
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={`mb-2 max-w-[85%] rounded-xl px-3 py-2 text-sm ${turn.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-secondary'}`}>
              {turn.text}
            </div>
          ))}
          {processing && <div className="text-xs text-muted-foreground">Listening back to you… thinking…</div>}
          {speaking && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Volume2 className="h-4 w-4 animate-pulse" aria-hidden /> Speaking reply…
            </div>
          )}
          {error && <div className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 bg-background/80 p-3">
          {!micDenied && (
            <Button
              size="icon"
              variant={listening ? 'destructive' : 'default'}
              className="h-11 w-11 shrink-0 rounded-full ievx-press"
              aria-label={listening ? 'Stop recording and send' : 'Start voice conversation'}
              disabled={processing && !listening}
              onClick={() => (listening ? stopListening(true) : void startListening())}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          )}
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (textDraft.trim()) {
                void sendText(textDraft)
                setTextDraft('')
              }
            }}
          >
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={micDenied ? 'Type your question…' : 'Speak, or type here…'}
              aria-label="Message the concierge"
              className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full ievx-press" aria-label="Send message" disabled={!textDraft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
        {listening && (
          <div className="flex items-center justify-center gap-1 bg-primary/5 py-1.5" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className="ievx-voice-bar" style={{ height: `${8 + (i % 4) * 7}px`, animationDelay: `${i * 0.09}s` }} />
            ))}
            <span className="ml-2 text-[11px] font-medium text-primary">Listening…</span>
          </div>
        )}
      </div>
    </div>
  )
}
