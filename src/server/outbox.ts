import { db } from '../lib/db'

/**
 * Durable outbox queue backed by SQLite (PostgreSQL remains the source of truth
 * in production deployments; Redis is never the only record of job completion —
 * see docs/ARCHITECTURE.md "Adaptations").
 */

export type OutboxJobType =
  | 'SEND_MESSAGE'
  | 'PROCESS_PROVIDER_EVENT'
  | 'RECONCILE_PAYMENT'
  | 'EVENT_LIFECYCLE'
  | 'REMINDER_SWEEP'
  | 'RESERVATION_SWEEP'
  | 'PLAYBACK_CLEANUP'
  | 'SMS_STATUS_POLL'
  | 'PROMOTION_BILL'
  | 'NOTIFY_PUSH'

export async function enqueue(type: OutboxJobType, payload: Record<string, unknown>, options?: { runAt?: Date; maxAttempts?: number }) {
  const job = await db.outboxJob.create({
    data: {
      type,
      payload: JSON.stringify(payload ?? {}),
      runAt: options?.runAt ?? new Date(),
      maxAttempts: options?.maxAttempts ?? 5,
    },
  })
  return job.id
}
