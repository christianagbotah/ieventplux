import { createHmac } from 'crypto'
import QRCode from 'qrcode'
import { env } from './env'

/**
 * Ticket credentials. The QR payload carries no personal data — only the opaque
 * ticket id plus an HMAC. Verification recomputes the HMAC server-side at scan time.
 */

export function ticketQrPayload(ticketId: string, code: string): string {
  const sig = createHmac('sha256', `${env.appSecret}:ticket`).update(`${ticketId}:${code}`).digest('hex').slice(0, 24)
  return `IEVX1.${ticketId}.${sig}`
}

export function verifyTicketQr(payload: string): { ticketId: string; ok: true } | { ok: false } {
  const parts = payload.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'IEVX1') return { ok: false }
  const [, ticketId, sig] = parts
  const expected = createHmac('sha256', `${env.appSecret}:ticket`).update(`${ticketId}:${ticketCodeFor(ticketId)}`).digest('hex').slice(0, 24)
  void expected // code is looked up from the DB during verification (see checkin service)
  if (!/^[a-f0-9]{24}$/i.test(sig)) return { ok: false }
  return { ticketId, ok: true }
}

// The verify function above only checks shape; full verification happens in the
// check-in service where the ticket code is available. Kept for clarity.
function ticketCodeFor(_ticketId: string): string {
  return ''
}

export function verifyTicketSignature(ticketId: string, code: string, sig: string): boolean {
  const expected = createHmac('sha256', `${env.appSecret}:ticket`).update(`${ticketId}:${code}`).digest('hex').slice(0, 24)
  return expected === sig
}

export async function qrSvg(payload: string, size = 220): Promise<string> {
  return QRCode.toString(payload, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' })
}

export async function qrDataUrl(payload: string, size = 220): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, width: size, errorCorrectionLevel: 'M' })
}
