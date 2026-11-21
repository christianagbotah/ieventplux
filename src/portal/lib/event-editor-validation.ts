/** Lightweight, client-side event editor validation.
 * Complements (never replaces) authoritative API validation.
 * Local datetime inputs are interpreted in the organizer's device timezone.
 */
export type EventDraftTiming = { title: string; startsAt: string; endsAt: string }
export type EventDraftErrors = { title?: string; startsAt?: string; endsAt?: string }

function parsedLocalDateTime(value: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!parts) return null
  const [, year, month, day, hour, minute, seconds] = parts
  const local = new Date(value)
  if (!Number.isFinite(local.getTime()) ||
      local.getFullYear() !== Number(year) ||
      local.getMonth() + 1 !== Number(month) ||
      local.getDate() !== Number(day) ||
      local.getHours() !== Number(hour) ||
      local.getMinutes() !== Number(minute) ||
      local.getSeconds() !== Number(seconds ?? 0)) return null
  return local.getTime()
}

export function validateEventDraftTiming(draft: EventDraftTiming): EventDraftErrors {
  const errors: EventDraftErrors = {}
  if (draft.title.trim().length < 3) errors.title = 'Add a descriptive title of at least 3 characters.'
  const start = parsedLocalDateTime(draft.startsAt)
  const end = parsedLocalDateTime(draft.endsAt)
  if (start === null) errors.startsAt = 'Select a valid event start date and time.'
  if (end === null) errors.endsAt = 'Select a valid event end date and time.'
  if (start !== null && end !== null && end <= start) {
    errors.endsAt = 'The end time must be later than the start time.'
  }
  return errors
}
export function eventDraftIsReady(draft: EventDraftTiming): boolean {
  return Object.keys(validateEventDraftTiming(draft)).length === 0
}
