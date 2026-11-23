/**
 * Entitled, explicitly joined rooms only. Never infer admission from a
 * meeting being publicly discoverable. The server performs the real gate.
 */
export function validNativeMeetingCredentials(value: unknown): value is { token: string; serverUrl: string } {
  if (!value || typeof value !== 'object') return false
  const data = value as { token?: unknown; serverUrl?: unknown }
  if (typeof data.token !== 'string' || data.token.length < 20 || data.token.length > 8192) return false
  if (typeof data.serverUrl !== 'string') return false
  try {
    const url = new URL(data.serverUrl)
    return url.protocol === 'wss:' && Boolean(url.hostname) && !url.username && !url.password &&
      !url.hash && !url.search && url.pathname === '/'
  } catch { return false }
}

export function mayEnterNativeRoom(state: {
  meetingStatus?: string
  engine?: string
  nativeCapable: boolean
}): boolean {
  return state.nativeCapable && state.meetingStatus === 'LIVE' && state.engine === 'sfu'
}
