/** Authorization-safe scan replay policy. Never expose a ticket based solely
 * on a caller-supplied clientScanId, even if its format looks unpredictable.
 */
export interface ScanReplayContext {
  eventId: string
  scannerId: string
  ticketId: string
}
export function isSameScanContext(
  previous: ScanReplayContext,
  incoming: Pick<ScanReplayContext, 'eventId' | 'scannerId'>,
): boolean {
  return previous.eventId === incoming.eventId && previous.scannerId === incoming.scannerId
}

export function isSameScanCredential(
  payload: string,
  ticket: { id: string; code: string },
  verifySignature: (ticketId: string, code: string, signature: string) => boolean,
): boolean {
  const raw = payload.trim()
  if (raw.toUpperCase() === ticket.code.toUpperCase()) return true
  const parts = raw.split('.')
  return parts.length === 3 && parts[0] === 'IEVX1' && parts[1] === ticket.id &&
    /^[a-f0-9]{24}$/i.test(parts[2]) &&
    verifySignature(ticket.id, ticket.code, parts[2])
}

export function validClientScanId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value)
}

export function validCaptureTime(value: string | undefined): boolean {
  if (value === undefined) return true
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  // Historical offline captures are allowed, but not fabricated future scans.
  return timestamp <= Date.now() + 5 * 60 * 1000
}
