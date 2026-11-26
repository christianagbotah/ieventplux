import type { Prisma } from '@prisma/client'

/** A sandbox provider transaction belongs to exactly one prepared attempt.
 * Both signed notification intake and independent verification must claim
 * the same unique attempt column within their evidence transaction.
 * Existing evidence-only records are checked as well for compatibility.
 * No provider request, fulfillment, settlement or ledger effect.
 */
export async function bindSandboxTransaction(
  tx: Prisma.TransactionClient,
  attemptId: string,
  providerTransactionId: string,
  notificationReceived = false,
) {
  if (!/^[1-9][0-9]{0,19}$/.test(providerTransactionId)) throw new Error('Invalid sandbox provider transaction identity.')
  const prior = await tx.platformSandboxCollectionEvidence.findUnique({ where: { providerTransactionId }, select: { attemptId: true } })
  if (prior && prior.attemptId !== attemptId) throw new Error('Provider transaction belongs to another attempt.')
  const locked = await tx.platformSandboxAttempt.updateMany({
    where: { id: attemptId, OR: [{ providerTransactionId: null }, { providerTransactionId }] },
    data: { providerTransactionId, updatedAt: new Date(), ...(notificationReceived ? { status: 'NOTIFICATION_RECEIVED' } : {}) },
  })
  if (locked.count !== 1) throw new Error('Conflicting provider transaction.')
  const evidence = await tx.platformSandboxCollectionEvidence.findUnique({ where: { attemptId } })
  if (evidence && evidence.providerTransactionId !== providerTransactionId) throw new Error('Existing evidence conflicts with provider transaction.')
}
