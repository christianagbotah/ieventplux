import { randomBytes, randomUUID } from 'crypto'

/** Buyer-facing order reference, unique within documented provider limits. */
export function orderReference(): string {
  return `ORD-${randomBytes(5).toString('hex').toUpperCase()}`
}

/** Unique per-attempt payment reference sent to the provider. */
export function paymentReference(orderRef: string, attemptNo: number): string {
  return `${orderRef}-A${attemptNo}`
}

/** Opaque ticket code (no personal data). */
export function ticketCode(): string {
  return `TKT-${randomBytes(7).toString('hex').toUpperCase()}`
}

export function invitationCode(): string {
  return randomBytes(6).toString('base64url').toUpperCase()
}

export function sessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function playbackToken(): string {
  return randomBytes(24).toString('hex')
}

export function transferToken(): string {
  return randomBytes(16).toString('hex')
}

export function correlationId(): string {
  return randomUUID()
}

export function deviceToken(): string {
  return randomBytes(24).toString('hex')
}

export function streamKey(): string {
  return randomBytes(18).toString('base64url')
}

export function otpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function invoiceNumber(seq: number): string {
  const year = new Date().getFullYear()
  return `INV-${year}-${String(seq).padStart(6, '0')}`
}
