/** Organizer event selection is always based on authorized records returned by the API. */
export function selectAttendeeEvent<T extends { id: string }>(
  loaded: T[],
  requestedId: string | null | undefined,
  scopedMatch?: T | null,
): { events: T[]; selectedId: string } {
  const id = requestedId?.trim() ?? ''
  const inLoaded = id ? loaded.find(item => item.id === id) : null
  const extra = !inLoaded && id && scopedMatch?.id === id ? scopedMatch : null
  const events = extra ? [extra, ...loaded] : loaded
  return { events, selectedId: inLoaded?.id ?? extra?.id ?? loaded[0]?.id ?? '' }
}

export function attendeeEventRoute(eventId: string): string {
  return '/organizer?tab=attendees&eventId=' + encodeURIComponent(eventId)
}

export function validScopedEventId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value)
}
