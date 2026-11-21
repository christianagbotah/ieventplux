/**
 * Media relay readiness: a production browser meeting cannot depend on STUN
 * alone. A working TURN service and a strong, private REST credential secret
 * must be configured before the meeting flag can enable production routes.
 * Connectivity must still be verified by a real two-network call.
 */
export interface MeetingTurnEnv {
  MEETING_TURN_URLS?: string
  MEETING_TURN_SHARED_SECRET?: string
}

export function configuredMeetingTurnUrls(env: MeetingTurnEnv): string[] {
  return (env.MEETING_TURN_URLS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
}

export function meetingTurnConfigured(env: MeetingTurnEnv): boolean {
  const urls = configuredMeetingTurnUrls(env)
  const secret = env.MEETING_TURN_SHARED_SECRET ?? ''
  if (secret.length < 32 || urls.length === 0 || urls.length > 8) return false
  return urls.every((url) => {
    if (!/^turns?:[^\s/@]+(?::\d{2,5})?(?:\?transport=(?:udp|tcp))?$/.test(url)) return false
    return !url.includes('localhost') && !url.includes('127.0.0.1')
  })
}

export function meetingRuntimeEnabled(
  env: MeetingTurnEnv & { IEVENTPLUX_GROUP_MEETINGS_ENABLED?: string; NODE_ENV?: string },
): boolean {
  if (env.IEVENTPLUX_GROUP_MEETINGS_ENABLED !== 'true') return false
  // Staging may deliberately test local browser signaling without TURN.
  if (env.NODE_ENV !== 'production') return true
  return meetingTurnConfigured(env)
}
