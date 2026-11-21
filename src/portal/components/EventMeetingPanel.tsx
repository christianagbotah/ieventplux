'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, MonitorUp, MessageSquare, Plus, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, FieldLabel, FieldHelp } from '@/components/ui/field'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'

type RoomRow = {
  id: string; title: string; status: string; maxParticipants: number; mediaEngine?: 'mesh' | 'sfu' | 'unavailable'
  screenShareEnabled: boolean; chatEnabled: boolean
}
type Payload = { enabled: boolean; meeting: RoomRow | null; canManage: boolean; mediaEngine?: 'mesh' | 'sfu' | 'unavailable' }

/** Used on the event page and the organizer's Meetings dashboard. */
export function EventMeetingPanel({ eventId, showDisabled = false }: { eventId: string; showDisabled?: boolean }) {
  const { user } = usePortal()
  const [info, setInfo] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('6')

  const refresh = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const payload = await api.get<Payload>(`/events/${eventId}/meeting`)
      setInfo(payload)
      setError('')
    } catch (err) {
      setInfo(null)
      // Denied visitors should not learn whether private meeting settings exist.
      if (!(err instanceof ApiClientError && err.status === 403)) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to check the meeting.')
      }
    } finally { setLoading(false) }
  }, [eventId, user?.id])

  useEffect(() => {
    setInfo(null)
    void refresh()
  }, [refresh])

  const create = async () => {
    setWorking(true); setError('')
    try {
      const { meeting } = await api.post<{ meeting: RoomRow }>(`/events/${eventId}/meeting`, {
        maxParticipants: info?.mediaEngine === 'sfu' ? 0 : Number(maxParticipants),
      })
      navigate('/meeting/' + meeting.id)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create this meeting.')
    } finally { setWorking(false) }
  }

  if (!user) return null
  if (!info && !error) {
    if (!loading) return null
    return <div role="status" aria-label="Loading meeting information" className="ievx-form-surface space-y-3 p-4 sm:p-5">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-14 w-full" />
    </div>
  }
  if (info && !info.enabled) {
    if (!showDisabled) return null // Never advertise an unavailable feature on public events.
    return <Card className="rounded-2xl"><CardContent className="flex items-start gap-3 p-4">
      <UsersRound className="mt-1 size-6 text-primary" aria-hidden />
      <div><p className="font-semibold">Interactive group meetings</p>
        <p className="mt-1 text-sm text-muted-foreground">This feature is not enabled on this server yet. Event tickets and livestreams continue to work normally.</p>
      </div>
    </CardContent></Card>
  }
  if (!info && !error) return null
  return <section aria-label="Event group meeting" className="ievx-form-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold"><UsersRound className="size-5 text-primary" /> Group meeting</h2>
        <p className="mt-1 text-sm text-muted-foreground">Real-time audio, video, participant chat and optional screen sharing for approved event attendees.</p>
      </div>
      <Button type="button" variant="outline" size="icon-sm" loading={loading} disabled={working}
        aria-label="Refresh meeting" title="Refresh meeting" onClick={() => void refresh()}>
        <RefreshCw className="size-4" aria-hidden />
      </Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {info?.meeting && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/65 bg-muted/35 p-3 sm:p-4">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-semibold">{info.meeting.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${info.meeting.status === 'LIVE' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-secondary text-secondary-foreground'}`}>{info.meeting.status === 'LIVE' ? 'Live now' : info.meeting.status === 'ENDED' ? 'Meeting ended' : 'Scheduled'}</span>
          <span><UsersRound className="mr-1 inline size-3" /> {info.meeting.mediaEngine === 'sfu' || info.meeting.maxParticipants === 0 ? 'No fixed attendee limit' : `Max ${info.meeting.maxParticipants}`}</span>
          {info.meeting.chatEnabled && <span><MessageSquare className="mr-1 inline size-3" /> Chat</span>}
          {info.meeting.screenShareEnabled && <span><MonitorUp className="mr-1 inline size-3" /> Screen sharing</span>}
        </p>
      </div>
      <Button variant={info.canManage ? "premium" : "default"} onClick={() => navigate('/meeting/' + info.meeting!.id)}>
        {info.canManage ? 'Open host room' : info.meeting.status === 'LIVE' ? 'Join meeting' : 'View meeting'}
      </Button>
    </div>}
    {info?.canManage && !info.meeting && <div className="mt-4 flex flex-wrap items-end gap-3">
      <Field className="min-w-[180px] flex-1 sm:flex-none">
        <FieldLabel htmlFor={`ievx-capacity-${eventId}`}>Meeting capacity</FieldLabel>
        {info.mediaEngine === 'sfu' ? <div id={`ievx-capacity-${eventId}`} className="flex min-h-11 items-center rounded-xl border border-primary/20 bg-primary/5 px-3.5 text-sm font-semibold text-primary">No fixed limit</div>
          : <select id={`ievx-capacity-${eventId}`} className="min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)}>
            {[2, 3, 4, 5, 6].map((n) => <option value={n} key={n}>{n}</option>)}
          </select>}
        {info.mediaEngine === 'sfu' && <FieldHelp>Media-server capacity scales with infrastructure.</FieldHelp>}
      </Field>
      <Button type="button" variant="premium" loading={working} onClick={() => void create()}>
        <Plus className="size-4" aria-hidden /> Create meeting
      </Button>
    </div>}
    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden /> Participation requires a signed-in account and a valid event ticket or approved RSVP. The organizer controls when the meeting starts.</p>
  </section>
}
