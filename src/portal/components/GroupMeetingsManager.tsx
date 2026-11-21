'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, UsersRound, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { EventMeetingPanel } from './EventMeetingPanel'
import { navigate } from '../router'

type EventOption = { id: string; title: string; status: string; mode: string; startsAt: string }
export function GroupMeetingsManager({ orgId }: { orgId: string }) {
  const [events, setEvents] = useState<EventOption[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.get<{ items: EventOption[] }>(
        `/events?mine=1&orgId=${encodeURIComponent(orgId)}&status=ALL&pageSize=50`,
      )
      const valid = result.items.filter((evt) => ['PUBLISHED', 'LIVE', 'ENDED'].includes(evt.status))
      setEvents(valid)
      setSelected((old) => valid.some((evt) => evt.id === old) ? old : (valid[0]?.id ?? ''))
      setError('')
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Unable to load organizer events.') }
    finally { setLoading(false) }
  }, [orgId])

  useEffect(() => {
    setSelected('')
    void load()
  }, [load])

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Two-way interaction</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold sm:text-2xl"><UsersRound className="size-6 text-primary" /> Group meetings</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Bring approved attendees into a shared video call with microphone, camera, chat and presenter screen sharing. Meeting rooms are separate from one-way event livestreams.</p>
      </div>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Refresh
      </Button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</div>}
    {events.length ? <div className="space-y-4">
      <label className="block max-w-2xl space-y-2 text-sm">
        <span className="font-medium">Choose a published event</span>
        <select className="min-h-11 w-full rounded-xl border bg-background px-3" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title} · {event.status}</option>)}
        </select>
      </label>
      {selected && <EventMeetingPanel key={selected} eventId={selected} />}
      <p className="text-xs text-muted-foreground">For larger public events, use Streaming Studio. Interactive browser-to-browser rooms intentionally limit simultaneous participants until a secure media server and TURN relay are validated.</p>
    </div> : !loading && <div className="rounded-2xl border border-dashed bg-card p-7 text-center">
      <Video className="mx-auto mb-3 size-10 text-primary" />
      <p className="font-bold">No published events available for a meeting</p>
      <p className="mt-1 text-sm text-muted-foreground">Create and publish an event before opening its private group room.</p>
      <Button className="mt-4" onClick={() => navigate('/organizer?tab=events&new=1')}>Create event</Button>
    </div>}
  </div>
}
