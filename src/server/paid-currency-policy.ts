/**
 * Until additional providers and ledger settlement currencies are certified,
 * a positive-priced ticket must use the payment currency Hubtel supports.
 * Free events can be joined from anywhere and do not invoke a charge.
 */
export function supportedTicketCheckoutCurrency(unitPriceMinor: number, currency: string): boolean {
  return Number.isSafeInteger(unitPriceMinor) &&
    unitPriceMinor >= 0 &&
    (unitPriceMinor === 0 || currency === 'GHS')
}
