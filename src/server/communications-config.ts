/** Credential configuration shared by the web admin and asynchronous message
 * worker. SMTP password is encrypted at rest with a purpose-specific key, and
 * never returned to a browser (including /admin/settings).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { env } from './env'
import { errors } from './api'
import { maskSecret } from './hubtel/credentials'

export const SMTP_SETTING_KEYS = {
  host: 'smtp.provider.host',
  port: 'smtp.provider.port',
  username: 'smtp.provider.username',
  password: 'smtp.provider.password.encrypted',
  from: 'smtp.provider.from',
} as const

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
  configured: boolean
  source: 'db' | 'env' | 'none'
}

export function validSmtpHost(value: string): boolean {
  const host = value.trim().toLowerCase()
  return host.length >= 4 && host.length <= 253 && host.includes('.') && !host.endsWith('.')
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)
    && !/(^|\.)(local|localhost|internal|lan|test|invalid)$/.test(host)
    && !host.endsWith('.arpa') && !/^[\d.]+$/.test(host)
}
export function validSmtpFrom(value: string): boolean {
  return value.length <= 200 && /^[^\s@<>]+@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value)
}
export function validSmtpPort(value: number): boolean {
  return [465, 587, 2525].includes(value)
}
function encryptionKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(env.appSecret), Buffer.from('ieventplux.smtp.credential.v1'), Buffer.from('smtp-password'), 32))
}
export function encryptSmtpPassword(secret: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return `enc1:${Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url')}`
}
export function decryptSmtpPassword(ciphertext: string): string {
  if (!ciphertext.startsWith('enc1:')) throw errors.unavailable('SMTP_KEY_INVALID', 'SMTP credentials need to be reconfigured by an administrator.')
  try {
    const raw = Buffer.from(ciphertext.slice(5), 'base64url')
    if (raw.length < 29) throw new Error('Invalid encrypted password')
    const dec = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12))
    dec.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([dec.update(raw.subarray(28)), dec.final()]).toString('utf8')
  } catch {
    throw errors.unavailable('SMTP_KEY_INVALID', 'SMTP credentials need to be reconfigured by an administrator.')
  }
}

export async function resolveSmtpConfig(): Promise<SmtpConfig> {
  const rows = await db.platformSetting.findMany({ where: { key: { in: Object.values(SMTP_SETTING_KEYS) } } })
  const settings = new Map(rows.map((row) => [row.key, row.value]))
  const configuredInDb = settings.has(SMTP_SETTING_KEYS.password)
  const fromDb = (key: string, defaultValue: string) => settings.get(key)?.trim() || defaultValue
  const host = fromDb(SMTP_SETTING_KEYS.host, env.smtp.host)
  const port = Number(fromDb(SMTP_SETTING_KEYS.port, String(env.smtp.port)))
  const user = fromDb(SMTP_SETTING_KEYS.username, env.smtp.user)
  const pass = configuredInDb ? decryptSmtpPassword(settings.get(SMTP_SETTING_KEYS.password)!) : env.smtp.pass
  const from = fromDb(SMTP_SETTING_KEYS.from, env.smtp.from)
  const configured = validSmtpHost(host) && validSmtpPort(port) && user.length > 0 && pass.length > 0 && validSmtpFrom(from)
  return { host, port, user, pass, from, configured, source: rows.length > 0 ? 'db' : env.smtp.host ? 'env' : 'none' }
}
export function smtpAdminView(config: SmtpConfig) {
  return { configured: config.configured, source: config.source, host: config.host, port: config.port,
    usernameMasked: maskSecret(config.user), passwordSaved: Boolean(config.pass), from: config.from,
    note: config.configured ? 'SMTP settings are present; successful server delivery has not yet been verified.' : 'Provide an SMTP host, port, account, app password and sender email.' }
}
