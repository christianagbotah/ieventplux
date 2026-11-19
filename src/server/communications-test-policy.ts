/** Strict, consent-based recipient normalization for deliberate platform-admin
 * provider tests. These are never bulk or marketing messages. */
export function normalizeAdminSmsTestPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40 || /[\r\n]/.test(value)) return null
  const normalized = value.replace(/[\s()-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

export function providerTestAcknowledgment(input: { queued: boolean; channel: 'SMS' | 'EMAIL' }) {
  if (!input.queued) return 'The provider test was not queued.'
  return input.channel === 'SMS'
    ? 'One SMS test was queued. Provider acceptance is not handset delivery. Check Message Log for DELIVERED, FAILED or UNKNOWN status; charges may apply.'
    : 'One email test was queued. Check Message Log for SMTP acceptance. Inbox arrival, spam filtering and recipient delivery remain unverified.'
}
