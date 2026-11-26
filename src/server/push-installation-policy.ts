import { createHash } from 'node:crypto'

/** The installation key is a high-entropy capability, never a public device ID. */
export function parsePushKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(raw)) return null
  return createHash('sha256').update(raw).digest('hex')
}
export function parsePushRegistration(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const keyHash = parsePushKey(data.installationKey)
  const providerToken = data.providerToken
  const platform = data.platform
  if (!keyHash || typeof providerToken !== 'string' ||
      !/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(providerToken) ||
      (platform !== 'ANDROID' && platform !== 'IOS') || data.permissionGranted !== true) return null
  return { keyHash, providerToken, platform }
}
