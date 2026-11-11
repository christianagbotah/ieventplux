import { db } from '../lib/db'

/** Append-only audit trail. Never contains secrets; payloads are trimmed. */
export async function audit(params: {
  actorUserId?: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  ip?: string | null
}) {
  const trim = (v: unknown) => {
    if (v === undefined || v === null) return null
    try {
      return JSON.stringify(v).slice(0, 4000)
    } catch {
      return null
    }
  }
  await db.auditLog
    .create({
      data: {
        actorUserId: params.actorUserId ?? null,
        actorLabel: params.actorLabel.slice(0, 120),
        action: params.action.slice(0, 80),
        entityType: params.entityType.slice(0, 40),
        entityId: params.entityId.slice(0, 64),
        before: trim(params.before),
        after: trim(params.after),
        ip: params.ip?.slice(0, 64) ?? null,
      },
    })
    .catch((err) => console.error('[audit] failed', err))
}
