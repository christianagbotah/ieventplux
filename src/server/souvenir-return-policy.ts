/** Physical return records are evidence only; they never imply money movement,
 * ticket revocation, seller settlement or restocking. */
export const RETURN_CONDITIONS = ['SEALED', 'OPENED', 'DAMAGED'] as const
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]
export type ReturnReviewDecision = 'ACCEPTED' | 'REJECTED'
export const RETURN_DECISIONS: readonly ReturnReviewDecision[] = ['ACCEPTED', 'REJECTED']

export function returnIntakeCapacity(collectedQty: number, pendingOrAcceptedQty: number): number {
  if (![collectedQty, pendingOrAcceptedQty].every((qty) => Number.isSafeInteger(qty) && qty >= 0)) {
    throw new Error('Return counts must be nonnegative safe integers')
  }
  if (pendingOrAcceptedQty > collectedQty) throw new Error('Recorded returns exceed collected units')
  return collectedQty - pendingOrAcceptedQty
}

export function validateReturnCondition(value: unknown): ReturnCondition | null {
  return typeof value === 'string' && RETURN_CONDITIONS.includes(value as ReturnCondition)
    ? value as ReturnCondition : null
}

export function validateReturnDecision(value: unknown): ReturnReviewDecision | null {
  return typeof value === 'string' && RETURN_DECISIONS.includes(value as ReturnReviewDecision)
    ? value as ReturnReviewDecision : null
}
