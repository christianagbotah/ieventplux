/** Parse only iEventPlux physical souvenir pickup credentials. Never follow
 * arbitrary QR URLs; organizer staff look up customer receipts via our own API. */
export type SouvenirScan = { type: 'token'; token: string } | { type: 'reference'; reference: string }
const TOKEN = /^ORD-[A-Z0-9-]{6,52}\.[a-f0-9]{32}$/i
const REFERENCE = /^ORD-[A-Z0-9-]{6,52}$/i

export function parseSouvenirScan(value: string, allowedOrigin: string): SouvenirScan | null {
  const text = value.trim()
  if (!text || text.length > 900) return null
  if (TOKEN.test(text)) return { type: 'token', token: text }
  const printedReference = text.replace(/^RCPT-/i, '')
  if (REFERENCE.test(printedReference)) return { type: 'reference', reference: printedReference.toUpperCase() }
  try {
    const url = new URL(text, allowedOrigin)
    const origin = new URL(allowedOrigin).origin
    if (url.origin !== origin || url.pathname !== '/' || url.search || url.username || url.password) return null
    const match = /^#\/collect\/(ORD-[A-Z0-9-]{6,52}\.[a-f0-9]{32})$/i.exec(url.hash)
    if (!match) return null
    return { type: 'token', token: match[1] }
  } catch {
    return null
  }
}
