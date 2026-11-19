/** Physical-product returns need evidence of handover and return/restock. This
 * pure guard never initiates a payment refund or alters stock on its own. */
export function physicalRefundReview(input: { lines: number; ordered: number; collected: number }): string | null {
  const { lines, ordered, collected } = input
  if (![lines, ordered, collected].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Invalid souvenir refund quantities')
  }
  if (lines === 0) return null // Existing ticket-only refund policy applies.
  return `Physical merchandise refund requires finance review and collection/return reconciliation (${collected} of ${ordered} ordered units handed over). No provider refund, stock adjustment, or ledger reversal has been initiated.`
}
