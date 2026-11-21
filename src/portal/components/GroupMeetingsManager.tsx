'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, RefreshCw, ShieldCheck, UsersRound, Video, ArrowRight, Radio, MonitorUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldHelp, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
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
      setSelected((previous) => valid.some((evt) => evt.id === previous) ? previous : (valid[0]?.id ?? ''))
      setError('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load organizer events.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    setSelected('')
    void load()
  }, [load])

  return <div className="min-w-0 space-y-5 sm:space-y-6">
    <section aria-labelledby="ievx-meetings-heading" className="relative isolate overflow-hidden rounded-[22px] border border-emerald-900/20 bg-gradient-to-br from-[#064b40] via-[#0c685a] to-[#133f4a] px-5 py-6 text-white shadow-[0_14px_36px_rgb(4_68_59_/_0.13)] sm:px-7 sm:py-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-28 -z-10 size-72 rounded-full border border-white/10 bg-white/[0.04]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-16 -z-10 size-60 rounded-full border border-white/10 bg-emerald-300/[0.06]" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.17em] text-emerald-100/85">Organizer studio · Live collaboration</p>
          <h2 id="ievx-meetings-heading" className="flex items-center gap-3 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10"><UsersRound className="size-6" aria-hidden /></span>
            Group Meetings
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-emerald-50/90 sm:text-[15px]">
            Bring your audience together with live video, voice, chat and presenter screen sharing. Control admission through verified event RSVPs and tickets.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={loading}
          onClick={() => void load()}
          className="border-white/25 bg-white/10 text-white hover:border-white/50 hover:bg-white/20 hover:text-white"
        >
          <RefreshCw className="size-4" aria-hidden /> Refresh events
        </Button>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2.5 text-xs font-medium text-emerald-50/95">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.09] px-3 py-2"><Radio className="size-3.5" aria-hidden /> Scalable video</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.09] px-3 py-2"><ShieldCheck className="size-3.5" aria-hidden /> Ticket / RSVP admission</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.09] px-3 py-2"><MonitorUp className="size-3.5" aria-hidden /> Presenter controls</span>
      </div>
    </section>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <p>{error}</p><Button type="button" size="sm" variant="outline" loading={loading} onClick={() => void load()}>Retry</Button>
    </div>}

    {loading && !events.length ? (
      <div role="status" aria-label="Loading organizer meetings" className="space-y-3 rounded-2xl border bg-card p-5">
        <Skeleton className="h-5 w-44 rounded-lg" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    ) : events.length ? <div className="min-w-0 space-y-4">
      <section aria-labelledby="ievx-meeting-event-select" className="rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="ievx-meeting-event-select" className="flex items-center gap-2 text-base font-bold tracking-tight"><CalendarDays className="size-5 text-primary" aria-hidden /> Select your event</h3>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{events.length} event{events.length === 1 ? '' : 's'} available</span>
        </div>
        <Field className="max-w-2xl">
          <FieldLabel htmlFor="ievx-meeting-event">Published or completed event</FieldLabel>
          <select
            id="ievx-meeting-event"
            className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-base text-foreground outline-none transition-[border-color,box-shadow] hover:border-primary/35 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 md:text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading}
          >
            {events.map((event) => <option key={event.id} value={event.id}>{event.title} · {event.status}</option>)}
          </select>
          <FieldHelp>Choose the event whose guests you want to invite. Every room retains its event-specific permissions.</FieldHelp>
        </Field>
      </section>
      {selected && <EventMeetingPanel key={selected} eventId={selected} showDisabled />}
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Scalable meetings do not have a fixed software participant limit. Real capacity depends on available media-server bandwidth and infrastructure. For one-way broadcasting, use Streaming Studio.
      </p>
    </div> : !loading && !error && <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center shadow-sm">
      <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Video className="size-7" aria-hidden /></span>
      <h3 className="text-lg font-bold tracking-tight">Create your first event meeting</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Publish an event first, then invite eligible guests into a secure room for audio, video and chat.</p>
      <Button variant="premium" className="mt-5" onClick={() => navigate('/organizer?tab=events&new=1')}>
        Create event <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>}
  </div>
}
