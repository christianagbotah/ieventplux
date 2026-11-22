/**
 * Restrict the organizer meeting picker to eligible events before pagination.
 * Existing organizer event listing behavior remains unchanged unless opted in.
 */
export const MEETING_ELIGIBLE_STATUSES = ['PUBLISHED', 'LIVE', 'ENDED'] as const

export function organizerEventCatalogFilters(input: {
  meetingEligible: boolean
  status: string | null
  q: string | null
}) {
  const title = input.meetingEligible ? (input.q ?? '').trim().slice(0, 120) : ''
  return {
    ...(input.meetingEligible
      ? { status: { in: [...MEETING_ELIGIBLE_STATUSES] } }
      : input.status && input.status !== 'ALL' ? { status: input.status } : {}),
    ...(title ? { title: { contains: title, mode: 'insensitive' as const } } : {}),
  }
}
