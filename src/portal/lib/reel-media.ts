/**
 * A direct MP4/WebM URL can use the browser's native decoder. An event poster
 * (or unknown HLS provider URL) must not be advertised as a playable clip.
 * HTTP is permitted only on loopback for local developer testing.
 */
export function isDirectPlayableVideo(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://ieventplux.lightworldtech.com')
    const secure = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
    return secure && /\.(mp4|webm)$/i.test(parsed.pathname)
  } catch {
    return false
  }
}
