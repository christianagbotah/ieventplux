/** Native video playback is restricted to this platform's own published media.
 * A `.jpg` clip row is an event preview, NOT a playable reel. Never let API
 * metadata send the device to arbitrary third-party URLs, private IPs or HTTP.
 */
const UPLOAD_VIDEO = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/i
const PLATFORM_ORIGIN = 'https://ieventplux.lightworldtech.com'

/** Return null until server-published, byte-range playable MP4 media exists. */
export function trustedReelVideoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw, PLATFORM_ORIGIN)
    if (url.origin !== PLATFORM_ORIGIN || url.username || url.password
      || url.search || url.hash || !UPLOAD_VIDEO.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

export function visibleReelMayPlay(args: {
  videoUrl: string | null
  clipId: string
  visibleClipId: string | null
  screenFocused: boolean
  appActive: boolean
  userPaused: boolean
}): boolean {
  return Boolean(args.videoUrl && args.visibleClipId === args.clipId && args.screenFocused && args.appActive && !args.userPaused)
}
