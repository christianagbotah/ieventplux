import { db } from '../../lib/db'
import { env } from '../env'

/**
 * Hubtel credential resolution — round 14.
 *
 * Credentials can now be supplied TWO ways, in priority order:
 *  1. Platform admin via Admin → Integrations (stored in PlatformSetting rows,
 *     write-only through the API: secrets are never returned, only masked).
 *  2. Environment variables (the original deployment-level configuration).
 *
 * The isolated payments/SMS simulator turns off automatically the moment real
 * credentials exist from EITHER source ("auto" mode), so connecting Hubtel in
 * the admin console takes effect immediately without a redeploy. An explicit
 * simulator override in the environment still wins in development; production
 * can never force the simulator on (env.ts boot guard).
 *
 * Honesty rules: every response that touches credentials reports the SOURCE
 * (db | env | none) and only masked previews. Secrets are stored server-side
 * and never logged (see docs/SECURITY_REVIEW.md round-14 note).
 */

export const HUBTEL_SETTING_KEYS = {
  checkoutClientId: 'hubtel.checkout.clientId',
  checkoutClientSecret: 'hubtel.checkout.clientSecret',
  checkoutBase: 'hubtel.checkout.base',
  sendMoneyClientId: 'hubtel.sendmoney.clientId',
  sendMoneyClientSecret: 'hubtel.sendmoney.clientSecret',
  sendMoneyAccountId: 'hubtel.sendmoney.accountId',
  smsClientId: 'hubtel.sms.clientId',
  smsClientSecret: 'hubtel.sms.clientSecret',
  smsSenderId: 'hubtel.sms.senderId',
  probeResult: 'hubtel.checkout.lastProbe',
} as const

export type CredSource = 'db' | 'env' | 'none'

export interface HubtelApiCreds {
  base: string
  clientId: string
  clientSecret: string
  /** Send Money only: merchant account number. */
  accountId: string
  /** SMS only: approved sender id. */
  senderId: string
}

export interface ResolvedHubtelCreds {
  checkout: HubtelApiCreds
  sendMoney: HubtelApiCreds
  sms: HubtelApiCreds
  sources: { checkout: CredSource; sendMoney: CredSource; sms: CredSource }
}

async function readSettings(keys: string[]): Promise<Map<string, string>> {
  const rows = await db.platformSetting.findMany({ where: { key: { in: keys } } })
  return new Map(rows.map((r) => [r.key, r.value]))
}

function pick(map: Map<string, string>, key: string, envValue: string, fallback = ''): { value: string; source: CredSource } {
  const dbValue = map.get(key)
  if (typeof dbValue === 'string' && dbValue.trim() !== '') return { value: dbValue.trim(), source: 'db' }
  if (envValue.trim() !== '') return { value: envValue, source: 'env' }
  return { value: fallback, source: 'none' }
}

/** Resolve effective Hubtel credentials (DB overrides env, per field). */
export async function resolveHubtelCreds(): Promise<ResolvedHubtelCreds> {
  const map = await readSettings(Object.values(HUBTEL_SETTING_KEYS))
  const checkoutId = pick(map, HUBTEL_SETTING_KEYS.checkoutClientId, env.hubtel.checkoutClientId)
  const checkoutSecret = pick(map, HUBTEL_SETTING_KEYS.checkoutClientSecret, env.hubtel.checkoutClientSecret)
  const checkoutBase = pick(map, HUBTEL_SETTING_KEYS.checkoutBase, env.hubtel.checkoutBase, 'https://pay.hubtel.com')
  const sendMoneyId = pick(map, HUBTEL_SETTING_KEYS.sendMoneyClientId, env.hubtel.sendMoneyClientId)
  const sendMoneySecret = pick(map, HUBTEL_SETTING_KEYS.sendMoneyClientSecret, env.hubtel.sendMoneyClientSecret)
  const sendMoneyAccount = pick(map, HUBTEL_SETTING_KEYS.sendMoneyAccountId, env.hubtel.sendMoneyAccountId)
  const smsId = pick(map, HUBTEL_SETTING_KEYS.smsClientId, env.hubtel.smsClientId)
  const smsSecret = pick(map, HUBTEL_SETTING_KEYS.smsClientSecret, env.hubtel.smsClientSecret)
  const smsSender = pick(map, HUBTEL_SETTING_KEYS.smsSenderId, env.hubtel.smsSenderId)

  const sourceOf = (a: CredSource, b: CredSource): CredSource => (a === 'db' || b === 'db' ? 'db' : a === 'env' && b === 'env' ? 'env' : a === 'env' || b === 'env' ? 'env' : 'none')

  return {
    checkout: {
      base: checkoutBase.value.replace(/\/$/, ''),
      clientId: checkoutId.value,
      clientSecret: checkoutSecret.value,
      accountId: '',
      senderId: '',
    },
    sendMoney: {
      base: env.hubtel.sendMoneyBase,
      clientId: sendMoneyId.value,
      clientSecret: sendMoneySecret.value,
      accountId: sendMoneyAccount.value,
      senderId: '',
    },
    sms: {
      base: env.hubtel.smsBase,
      clientId: smsId.value,
      clientSecret: smsSecret.value,
      accountId: '',
      senderId: smsSender.value,
    },
    sources: {
      checkout: sourceOf(checkoutId.source, checkoutSecret.source),
      sendMoney: sourceOf(sourceOf(sendMoneyId.source, sendMoneySecret.source), sendMoneyAccount.source),
      sms: sourceOf(sourceOf(smsId.source, smsSecret.source), smsSender.source),
    },
  }
}

/**
 * Dynamic simulator gate. Explicit env override wins (development only —
 * production boot refuses force-on); otherwise "auto" turns the simulator off
 * the moment real checkout credentials exist from either source.
 */
export function paymentsSimulatorActive(creds: ResolvedHubtelCreds): boolean {
  if (process.env.PAYMENTS_SIMULATOR !== undefined && process.env.PAYMENTS_SIMULATOR !== 'auto') {
    return ['1', 'true', 'yes'].includes(process.env.PAYMENTS_SIMULATOR)
  }
  return !(creds.checkout.clientId && creds.checkout.clientSecret)
}

/** Same rule for SMS (sender id required in addition to credentials). */
export function smsSimulatorActive(creds: ResolvedHubtelCreds): boolean {
  if (process.env.SMS_SIMULATOR !== undefined && process.env.SMS_SIMULATOR !== 'auto') {
    return ['1', 'true', 'yes'].includes(process.env.SMS_SIMULATOR)
  }
  return !(creds.sms.clientId && creds.sms.clientSecret && creds.sms.senderId)
}

export interface SimulatorModes {
  paymentsSimulator: boolean
  smsSimulator: boolean
  creds: ResolvedHubtelCreds
}

/** One-shot mode resolution for routes/services that need both flags. */
export async function resolveSimulatorModes(): Promise<SimulatorModes> {
  const creds = await resolveHubtelCreds()
  return { paymentsSimulator: paymentsSimulatorActive(creds), smsSimulator: smsSimulatorActive(creds), creds }
}

/** Masked preview for admin UIs — never a full secret. */
export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `${value.slice(0, 3)}••••${value.slice(-2)}`
}

export interface HubtelCredentialsView {
  checkout: { clientIdMasked: string; clientSecretMasked: string; base: string; source: CredSource; configured: boolean }
  sendMoney: { clientIdMasked: string; clientSecretMasked: string; accountIdMasked: string; source: CredSource; configured: boolean }
  sms: { clientIdMasked: string; clientSecretMasked: string; senderIdMasked: string; source: CredSource; configured: boolean }
  paymentsMode: 'SIMULATOR' | 'REAL'
}

/** Admin-facing masked view (GET /admin/hubtel). Secrets are never included. */
export function hubtelCredentialsView(creds: ResolvedHubtelCreds): HubtelCredentialsView {
  const checkoutConfigured = Boolean(creds.checkout.clientId && creds.checkout.clientSecret)
  const sendMoneyConfigured = Boolean(creds.sendMoney.clientId && creds.sendMoney.clientSecret && creds.sendMoney.accountId)
  const smsConfigured = Boolean(creds.sms.clientId && creds.sms.clientSecret && creds.sms.senderId)
  return {
    checkout: {
      clientIdMasked: maskSecret(creds.checkout.clientId),
      clientSecretMasked: maskSecret(creds.checkout.clientSecret),
      base: creds.checkout.base,
      source: creds.sources.checkout,
      configured: checkoutConfigured,
    },
    sendMoney: {
      clientIdMasked: maskSecret(creds.sendMoney.clientId),
      clientSecretMasked: maskSecret(creds.sendMoney.clientSecret),
      accountIdMasked: maskSecret(creds.sendMoney.accountId),
      source: creds.sources.sendMoney,
      configured: sendMoneyConfigured,
    },
    sms: {
      clientIdMasked: maskSecret(creds.sms.clientId),
      clientSecretMasked: maskSecret(creds.sms.clientSecret),
      senderIdMasked: maskSecret(creds.sms.senderId),
      source: creds.sources.sms,
      configured: smsConfigured,
    },
    paymentsMode: paymentsSimulatorActive(creds) ? 'SIMULATOR' : 'REAL',
  }
}

export interface ProbeResult {
  at: string
  ok: boolean
  verdict: string
  httpStatus: number | null
  detail: string
  snippet: string
}

/** Persist the last checkout connection probe (read back by the admin console). */
export async function readLastProbe(): Promise<ProbeResult | null> {
  const row = await db.platformSetting.findUnique({ where: { key: HUBTEL_SETTING_KEYS.probeResult } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as ProbeResult
  } catch {
    return null
  }
}
