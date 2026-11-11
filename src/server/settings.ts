import { db } from '../lib/db'

/** Platform settings with typed defaults (see docs/OPERATIONS.md for each knob). */
export interface PlatformSettings {
  reservationMinutes: number
  reconcileAfterMinutes: number
  maxReconcileChecks: number
  payoutHoldDays: number
  quietHoursStart: number // hour, organizer local time
  quietHoursEnd: number
  maxSmsSegmentsPerMessage: number
  outboxMaxAttempts: number
  gracePeriodDays: number // subscription grace
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  reservationMinutes: 15,
  reconcileAfterMinutes: 5,
  maxReconcileChecks: 6,
  payoutHoldDays: 3,
  quietHoursStart: 20,
  quietHoursEnd: 8,
  maxSmsSegmentsPerMessage: 6,
  outboxMaxAttempts: 5,
  gracePeriodDays: 3,
}

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await db.platformSetting.findMany()
  const merged: Record<string, string> = {}
  for (const row of rows) merged[row.key] = row.value
  const result = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PlatformSettings)[]) {
    if (merged[key] !== undefined) {
      const n = Number(merged[key])
      if (Number.isFinite(n)) result[key] = n
    }
  }
  return result as unknown as PlatformSettings
}

export async function setSetting(key: string, value: string, updatedBy: string) {
  await db.platformSetting.upsert({ where: { key }, create: { key, value, updatedBy }, update: { value, updatedBy } })
}

export async function getSetting(key: keyof PlatformSettings): Promise<number> {
  const row = await db.platformSetting.findUnique({ where: { key } })
  if (!row) return DEFAULT_SETTINGS[key]
  const n = Number(row.value)
  return Number.isFinite(n) ? n : DEFAULT_SETTINGS[key]
}
