'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Upload, ShieldCheck, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiClientError } from '../api'

type EventChoice = { id: string; title: string; status: string; visibility: string }
type ClipItem = {
  id: string
  eventId: string | null
  caption: string | null
  status: string
  createdAt: string
  event: { title: string; status: string; visibility: string } | null
}
type StudioPayload = {
  enabled: boolean
  maxBytes: number
  maxPending: number
  events: EventChoice[]
  clips: ClipItem[]
}

export function CreatorClipsStudio({ orgId }: { orgId: string }) {
  const [payload, setPayload] = useState<StudioPayload | null>(null)
  const [eventId, setEventId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const revision = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const request = ++revision.current
    setLoading(true)
    setError('')
    try {
      const result = await api.get<StudioPayload>(`/orgs/${orgId}/clips`)
      if (request !== revision.current) return
      setPayload(result)
      setEventId((prev) => prev && result.events.some((event) => event.id === prev)
        ? prev : (result.events[0]?.id ?? ''))
    } catch (err) {
      if (request !== revision.current) return
      setPayload(null)
      setError(err instanceof ApiClientError ? err.message : 'Could not load your creator media.')
    } finally {
      if (request === revision.current) setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    setPayload(null)
    setError('')
    setFile(null)
    setEventId('')
    setMessage('')
    void refresh()
    return () => {revision.current++}
  }, [refresh])

  const pending = payload?.clips.filter((clip) => clip.status === 'PROCESSING').length ?? 0
  const approved = payload?.clips.filter((clip) => clip.status === 'READY').length ?? 0
  const canUpload = Boolean(payload?.enabled && eventId && file && rightsConfirmed && consentConfirmed
    && pending < (payload?.maxPending ?? 0) && !busy)
  const upload = async () => {
    if (!canUpload || !file || !payload) return
    setError('')
    setMessage('')
    if (!['video/mp4', 'video/webm'].includes(file.type) || !file.size || file.size > payload.maxBytes) {
      setError('Choose a valid MP4 or WebM video no larger than 25MB.')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'CLIP')
      form.append('eventId', eventId)
      form.append('orgId', orgId)
      form.append('caption', caption)
      form.append('rightsConfirmed', 'true')
      form.append('consentConfirmed', 'true')
      const result = await api.upload<{ asset: { id: string; status: string } }>('/uploads', form)
      if (result.asset.status !== 'PROCESSING') throw new Error('Video intake did not return the expected review state.')
      setMessage('Clip safely submitted for review. It is NOT public or playable until moderation and media processing approve it.')
      setFile(null)
      setCaption('')
      setRightsConfirmed(false)
      setConsentConfirmed(false)
      if (fileInput.current) fileInput.current.value = ''
      await refresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Submitted clips</p><p className="mt-1 text-3xl font-extrabold tabular-nums">{payload?.clips.length ?? '—'}</p><p className="mt-1 text-xs text-muted-foreground">Your recent event media</p></div>
      <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Awaiting review</p><p className="mt-1 text-3xl font-extrabold tabular-nums text-amber-600">{payload ? pending : '—'}</p><p className="mt-1 text-xs text-muted-foreground">Private, not yet visible in Reels</p></div>
      <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Ready media</p><p className="mt-1 text-3xl font-extrabold tabular-nums text-primary">{payload ? approved : '—'}</p><p className="mt-1 text-xs text-muted-foreground">Subject to event visibility rules</p></div>
    </div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Creator media</p>
        <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Event clips</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Capture moments from your events and build your audience. Videos enter a private review queue before they can appear in Reels.</p>
      </div>
      <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void refresh()} aria-label="Refresh creator video review status">
        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Refresh
      </Button>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}
    </div>}
    {message && <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{message}</div>}

    {payload && !payload.enabled && <div className="flex items-start gap-3 rounded-2xl border bg-secondary/40 p-4" role="status">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="text-sm font-semibold">Creator upload pilot is not enabled yet</p>
        <p className="mt-1 text-sm text-muted-foreground">We are keeping large video uploads off until storage, scanning, review and playback are verified. Your existing event publishing and images continue to work.</p>
      </div>
    </div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="size-5 text-primary" aria-hidden /> Submit a creator video</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="creator-clip-event">Associated event</Label>
            <select id="creator-clip-event" value={eventId} onChange={(e) => setEventId(e.target.value)}
              disabled={!payload?.enabled || busy} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
              {payload?.events.length ? payload.events.map((event) => <option value={event.id} key={event.id}>{event.title} · {event.status}</option>) : <option value="">Create an event first</option>}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="creator-clip-file">Video file (MP4 / WebM, maximum 25MB)</Label>
            <Input ref={fileInput} id="creator-clip-file" type="file" accept="video/mp4,video/webm" disabled={!payload?.enabled || busy}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }} />
            {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="creator-clip-caption">Caption</Label>
            <Textarea id="creator-clip-caption" maxLength={200} value={caption} disabled={!payload?.enabled || busy}
              onChange={(e) => setCaption(e.target.value)} placeholder="What makes this moment special?" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={rightsConfirmed} disabled={!payload?.enabled || busy}
              onChange={(e) => setRightsConfirmed(e.target.checked)} />
            <span>I own this video or hold permission to publish the footage and soundtrack.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={consentConfirmed} disabled={!payload?.enabled || busy}
              onChange={(e) => setConsentConfirmed(e.target.checked)} />
            <span>I have any necessary permission to feature people in the video, including minors where applicable.</span>
          </label>
          <Button className="w-full rounded-xl" disabled={!canUpload} onClick={() => void upload()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            {busy ? 'Submitting securely…' : 'Submit for review'}
          </Button>
          <p className="text-xs text-muted-foreground">Submissions are private until approved. This pilot does not yet provide transcoding, automatic safety scanning or public playback of pending media.</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Film className="size-5 text-primary" aria-hidden /> Your clip queue</CardTitle></CardHeader>
        <CardContent>
          {!payload ? <p className="text-sm text-muted-foreground">{loading ? 'Loading clips…' : 'No media information available.'}</p>
            : <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{pending} of {payload.maxPending} pending-review slots used. A submitted video is not public merely because its upload succeeded.</p>
              {payload.clips.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No event clips submitted yet.</p>
                : payload.clips.map((clip) => <div key={clip.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold">{clip.caption || clip.event?.title || 'Event clip'}</p>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold">{clip.status === 'PROCESSING' ? 'Pending review' : clip.status === 'READY' ? 'Approved' : clip.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{clip.event?.title ?? 'Event unavailable'} · {new Date(clip.createdAt).toLocaleDateString()}</p>
                </div>)}
            </div>}
        </CardContent>
      </Card>
    </div>
  </div>
}
