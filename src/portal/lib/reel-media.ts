/**
 * An event poster is not a video. Browser playback is limited to actual
 * same-origin, UUID-named published MP4 resources. The API is responsible for
 * READY moderation / public-event permission checks; this helper prevents
 * accidentally treating synthetic poster rows or external links as video.
 */
const VIDEO_PATH = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/i
const ORIGIN = 'https://ieventplux.lightworldtech.com'

export function publishedReelVideoSrc(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = new URL(raw, ORIGIN)
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash
      || !VIDEO_PATH.test(parsed.pathname)) return null
    // Root-relative URL keeps the browser's same-origin/CORP behavior.
    return parsed.pathname
  } catch { return null }
}
