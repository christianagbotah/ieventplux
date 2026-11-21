/** Parse only iEventPlux physical souvenir pickup credentials. Never follow
 * arbitrary QR URLs; organizer staff look up customer receipts via our own API. */
export type SouvenirScan = { type: 'token'; token: string } | { type: 'reference'; reference: string }
const TOKEN = /^ORD-[A-Z0-9-]{6,52}\.[a-f0-9]{32}$/i
const REFERENCE = /^ORD-[A-Z0-9-]{6,52}$/i

export function parseSouvenirScan(value: string, allowedOrigin: string): SouvenirScan | null {
  // QR credentials must be a single printable line. Do not let trimming or
  // URL parsing silently normalize control characters in scanned input.
  if (/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u.test(value)) return null
  const text = value.trim()
  if (!text || text.length > 900) return null
  if (TOKEN.test(text)) return { type: 'token', token: text }
  const printedReference = text.replace(/^RCPT-/i, '')
  if (REFERENCE.test(printedReference)) return { type: 'reference', reference: printedReference.toUpperCase() }
  // URL() normalizes backslashes and accepts scheme-relative or other ambiguous
  // forms. Only explicit HTTPS links or our exact root-relative collection path
  // are valid QR link representations.
  if (text.includes('\\') || !(text.startsWith('https://') || text.startsWith('/#/collect/'))) return null
  try {
    const url = new URL(text, allowedOrigin)
    const trusted = new URL(allowedOrigin)
    // Collection links must not downgrade staff review credentials to HTTP.
    if (trusted.protocol !== 'https:' || url.protocol !== 'https:') return null
    if (url.origin !== trusted.origin || url.pathname !== '/' || url.search || url.username || url.password) return null
    const match = /^#\/collect\/(ORD-[A-Z0-9-]{6,52}\.[a-f0-9]{32})$/i.exec(url.hash)
    if (!match) return null
    return { type: 'token', token: match[1] }
  } catch {
    return null
  }
}
