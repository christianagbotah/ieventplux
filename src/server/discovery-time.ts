/**
 * User-local discovery windows, converted into UTC before filtering events.
 * Events keep absolute UTC instants; an attendee in Tokyo must not inherit
 * the production server's Africa/Accra calendar date.
 */
export type CalendarDiscoveryWindow = 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND'

export function safeDiscoveryTimezone(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 80) return 'UTC'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (part: string) => Number(parts.find((p) => p.type === part)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** Resolve local midnight even across a UTC-offset / daylight-saving change. */
export function localMidnightAsUtc(year: number, month: number, day: number, timeZone: string): Date {
  const desired = Date.UTC(year, month - 1, day)
  let guess = desired
  for (let i = 0; i < 4; i++) {
    const local = localParts(new Date(guess), timeZone)
    const actualLocalAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
    const corrected = guess + (desired - actualLocalAsUtc)
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess)
}

export function discoveryCalendarWindow(
  when: CalendarDiscoveryWindow,
  rawTimeZone: unknown,
  now = new Date(),
): { gte: Date; lt: Date } {
  const timeZone = safeDiscoveryTimezone(rawTimeZone)
  const local = localParts(now, timeZone)
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day))
  const midnightAfterDays = (days: number) => localMidnightAsUtc(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate() + days,
    timeZone,
  )

  if (when === 'TODAY') return { gte: now, lt: midnightAfterDays(1) }
  if (when === 'THIS_WEEK') {
    // Current ISO-style week ends at the attendee's next Monday midnight.
    const weekday = localDate.getUTCDay()
    return { gte: now, lt: midnightAfterDays(weekday === 0 ? 1 : 8 - weekday) }
  }

  // A Sunday search must include the remainder of THIS weekend, not jump
  // to Saturday of next week. Saturday/Sunday show remaining time only.
  const weekday = localDate.getUTCDay() // Sunday = 0, Saturday = 6
  const untilSaturday = weekday === 0 ? -1 : (6 - weekday + 7) % 7
  const startSaturday = midnightAfterDays(untilSaturday)
  return { gte: startSaturday > now ? startSaturday : now, lt: midnightAfterDays(untilSaturday + 2) }
}
