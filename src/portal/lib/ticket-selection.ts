/**
 * Event detail selection policy must agree with the current payment backend.
 * Paid GHS tickets can be checked out through the configured Ghana provider.
 * Free tickets are never charged; international paid currency is unsupported
 * until corresponding settlement adapters are certified.
 */
export type TicketQuote = {
  id: string
  priceMinor: number
  currency: string
  perBuyerLimit: number
  quota: number
  soldCount: number
  reservedCount: number
  groupMinQty?: number | null
  groupPctOff?: number | null
}

export function ticketCheckoutSupported(ticket: Pick<TicketQuote, 'priceMinor' | 'currency'>): boolean {
  return Number.isSafeInteger(ticket.priceMinor) &&
    ticket.priceMinor >= 0 &&
    (ticket.priceMinor === 0 || ticket.currency === 'GHS')
}

export function ticketAvailability(ticket: Pick<TicketQuote, 'quota' | 'soldCount' | 'reservedCount' | 'perBuyerLimit'>): number {
  const available = ticket.quota > 0
    ? Math.max(0, ticket.quota - ticket.soldCount - ticket.reservedCount)
    : ticket.perBuyerLimit
  return Math.max(0, Math.min(ticket.perBuyerLimit, available))
}

/** A free-only basket must not be presented as a paid checkout just because
 * other priced ticket types appear on the same event page. */
export function hasPaidAdmissionSelection(
  tickets: Pick<TicketQuote, 'id' | 'priceMinor'>[],
  quantities: Record<string, number>,
): boolean {
  return tickets.some((ticket) => ticket.priceMinor > 0 && (quantities[ticket.id] ?? 0) > 0)
}

/** Indicative base ticket subtotal; server remains authoritative on totals. */
export function quoteTicketSelection(tickets: TicketQuote[], quantities: Record<string, number>) {
  let subtotalMinor = 0
  let count = 0
  let unsupported = false
  let invalid = false
  for (const ticket of tickets) {
    const qty = quantities[ticket.id] ?? 0
    if (!Number.isSafeInteger(qty) || qty < 0 || qty > ticketAvailability(ticket)) {
      invalid = true
      continue
    }
    if (qty === 0) continue
    if (!ticketCheckoutSupported(ticket)) {
      unsupported = true
      continue
    }
    const lineBase = ticket.priceMinor * qty
    const discount = ticket.groupMinQty && ticket.groupPctOff && qty >= ticket.groupMinQty
      ? Math.round(lineBase * ticket.groupPctOff / 100)
      : 0
    const line = lineBase - discount
    if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(subtotalMinor + line)) {
      invalid = true
      continue
    }
    subtotalMinor += line
    count += qty
  }
  return { subtotalMinor, count, unsupported, invalid }
}
