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
    // The production LiveKit signalling endpoint is reverse-proxied at
    // /livekit, not at the origin root. React Native must preserve that
    // path. Allow safe path segments only; never embed credentials/query
    // parameters or downgrade WebSocket TLS.
    const safeProxyPath = url.pathname === '/' ||
      /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname)
    return url.protocol === 'wss:' && Boolean(url.hostname) && !url.username && !url.password &&
      !url.hash && !url.search && safeProxyPath
  } catch { return false }
}

export function mayEnterNativeRoom(state: {
  meetingStatus?: string
  engine?: string
  nativeCapable: boolean
}): boolean {
  return state.nativeCapable && state.meetingStatus === 'LIVE' && state.engine === 'sfu'
}
