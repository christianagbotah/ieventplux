/**
 * Invite links only return to a meeting inside this hash-routed application.
 * Do not allow arbitrary browser / external redirect destinations in ?next=.
 */
const MEETING_ROUTE = /^\/meeting\/[A-Za-z0-9_-]{8,128}$/

export function safeMeetingReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length > 160) return null
  return MEETING_ROUTE.test(value) ? value : null
}

export function meetingAuthRoute(
  mode: 'signin' | 'register',
  returnPath: string | null | undefined,
): string {
  const safe = safeMeetingReturnPath(returnPath)
  return '/' + mode + (safe ? '?next=' + encodeURIComponent(safe) : '')
}

export function meetingSignInRoute(meetingId: string): string {
  return meetingAuthRoute('signin', '/meeting/' + meetingId)
}
