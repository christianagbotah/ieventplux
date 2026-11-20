/** Event management UX policy. Data is passed in; no private data is inferred. */
export type OrganizerEventRow = {
  id: string
  title: string
  slug: string
  status: string
  visibility: string
  startsAt: string
  endsAt: string
  city?: string | null
  categorySlug: string
}
export type OrganizerEventFilter = 'ALL' | 'ATTENTION' | 'UPCOMING' | 'LIVE' | 'PAST'

export const ORGANIZER_EVENT_FILTERS: { value: OrganizerEventFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ATTENTION', label: 'Needs attention' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'LIVE', label: 'Live now' },
  { value: 'PAST', label: 'Past & cancelled' },
]

export function eventMatchesView(event: OrganizerEventRow, view: OrganizerEventFilter, now: number): boolean {
  const starts = new Date(event.startsAt).getTime()
  const ends = new Date(event.endsAt).getTime()
  switch (view) {
    case 'ALL': return true
    case 'ATTENTION': return ['DRAFT', 'POSTPONED'].includes(event.status)
    case 'UPCOMING': return ['PUBLISHED', 'SCHEDULED'].includes(event.status) && ends >= now
    case 'LIVE': return event.status === 'LIVE'
    case 'PAST': return ['ENDED', 'CANCELLED'].includes(event.status) ||
      (!['DRAFT', 'POSTPONED', 'LIVE'].includes(event.status) && Number.isFinite(starts) && ends < now)
  }
}

export function organizerEventCounts(events: OrganizerEventRow[], now: number) {
  return Object.fromEntries(ORGANIZER_EVENT_FILTERS.map(f => [f.value, events.filter(e => eventMatchesView(e, f.value, now)).length])) as Record<OrganizerEventFilter, number>
}

export function filterOrganizerEvents<T extends OrganizerEventRow>(
  events: T[],
  options: { view: OrganizerEventFilter; query: string; now?: number },
): T[] {
  const now = options.now ?? Date.now()
  const query = options.query.trim().toLocaleLowerCase()
  return events
    .filter(e => eventMatchesView(e, options.view, now))
    .filter(e => !query || [e.title, e.city, e.categorySlug, e.status].some(v => (v ?? '').toLocaleLowerCase().includes(query)))
    .sort((a,b) => {
      const aPast = new Date(a.endsAt).getTime() < now
      const bPast = new Date(b.endsAt).getTime() < now
      if (aPast !== bPast) return aPast ? 1 : -1
      if (!aPast) return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    })
}

export function eventStatusConfirmation(to: 'PUBLISHED'|'POSTPONED'|'CANCELLED') {
  if (to === 'PUBLISHED') return {
    title: 'Publish this event?',
    description: 'If the event is public, attendees can discover it once publishing succeeds. Verify the schedule, prices and ticket capacity first.',
    button: 'Publish event',
  }
  if (to === 'POSTPONED') return {
    title: 'Postpone this event?',
    description: 'The event will be marked postponed. You must separately communicate replacement arrangements and handle attendee obligations.',
    button: 'Postpone event',
  }
  return {
    title: 'Cancel this event?',
    description: 'Cancellation can affect existing ticket holders. This action does not automatically complete refunds or attendee communications. Review your obligations before proceeding.',
    button: 'Cancel event',
  }
}

export function isEventShareable(event: OrganizerEventRow) {
  return event.visibility === 'PUBLIC' && ['PUBLISHED', 'LIVE'].includes(event.status)
}

/** Mirror action visibility rules; backend separately authorizes every request. */
export function eventTransitionAllowed(role: string, status: string, to: 'PUBLISHED' | 'POSTPONED' | 'CANCELLED'): boolean {
  const canPublish = ['OWNER','ADMIN','EVENT_MANAGER'].includes(role)
  const canCancel = ['OWNER','ADMIN'].includes(role)
  if (to === 'PUBLISHED') return canPublish && ['DRAFT','SCHEDULED'].includes(status)
  if (to === 'POSTPONED') return canCancel && status === 'PUBLISHED'
  return canCancel && ['PUBLISHED','POSTPONED','SCHEDULED'].includes(status)
}
