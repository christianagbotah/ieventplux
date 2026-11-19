/** Financially accurate operator confirmation. Never infer settlement from a
 * successful HTTP response: it may only mean manual review was opened. */
export function refundActionFeedback(op: 'approve' | 'process' | 'reject', status?: string) {
  const outcome = status ?? (op === 'approve' ? 'APPROVED' : op === 'reject' ? 'REJECTED' : 'UNKNOWN')
  switch (outcome) {
    case 'MANUAL_TRACKED':
      return { title: 'Manual refund review required', description: 'Manual finance review only. No money was refunded, no stock was returned, and no tickets or ledger entries were reversed.' }
    case 'PROCESSED':
      return { title: 'Refund processed', description: 'The server recorded a refund outcome. Verify the provider settlement and ledger before confirming the funds reached the buyer.' }
    case 'APPROVED':
      return { title: 'Refund approved', description: 'Approval recorded; the refund has not been paid. Await finance processing and provider verification.' }
    case 'REJECTED':
      return { title: 'Refund rejected', description: 'Request declined. No refund payment was made.' }
    default:
      return { title: 'Refund status updated', description: `Refund outcome: ${outcome}. Review the case before claiming any money, ticket or stock movement.` }
  }
}
