/**
 * Compatibility for links pasted without our existing /#/ SPA prefix.
 * Restrict redirects to known client-side routes, not API or asset paths.
 */
const pages = new Set([
  'following', 'live', 'reels', 'effects', 'signin', 'register',
  'me', 'organizer', 'admin', 'create-org', 'ai-studio', 'search',
])
const details = new Set(['event', 'org', 'order', 'broadcast', 'meeting', 'claim', 'invite'])

export function legacyHashLocation(
  segments: string[],
  search: Record<string, string | string[] | undefined>,
): string | null {
  if (segments.length < 1 || segments.length > 2) return null
  const [head] = segments
  if (!(segments.length === 1 ? pages.has(head) : details.has(head))) return null
  if (segments.some((segment) => !segment || segment.length > 200)) return null

  let path: string
  try {
    path = '/' + segments.map((segment) => encodeURIComponent(segment)).join('/')
  } catch {
    return null
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
    for (const item of values) {
      if (item.length <= 1024) query.append(key, item)
    }
  }
  return '/#' + path + (query.size ? '?' + query.toString() : '')
}
