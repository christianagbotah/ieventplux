/**
 * Hubtel SMS adapter.
 *
 * VERIFICATION STATUS (docs/PROVIDER_CAPABILITIES.md): implemented against the
 * documented v1 send contract (POST /v1/messages/send, Basic auth, From = approved
 * sender ID) with delivery-state tracking. NOT sandbox-verified — no credentials
 * supplied. Re-verify against https://code.hubtel.com/docs/guides/sms-delivery.
 *
 * Rules implemented:
 *  - API acceptance ≠ handset delivery: SENT → ACCEPTED only after provider ack;
 *    DELIVERED only from a documented delivery state.
 *  - Segment estimation (GSM-7 vs Unicode) shown BEFORE bulk sends.
 *  - Development simulator is explicit and never sends live messages.
 */

export interface SmsSendResult {
  ok: boolean
  provider: 'HUBTEL' | 'SIMULATOR'
  messageId?: string
  error?: string
}

export async function sendSms(params: { to: string; body: string; purpose: string }): Promise<SmsSendResult> {
  // Round 14: dynamic simulator gate + per-request credential resolution
  // (admin-saved keys override env without a redeploy).
  const { resolveHubtelCreds, smsSimulatorActive } = await import('./credentials')
  const creds = await resolveHubtelCreds()
  if (smsSimulatorActive(creds)) {
    return { ok: true, provider: 'SIMULATOR', messageId: `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  }
  if (!creds.sms.clientId || !creds.sms.clientSecret || !creds.sms.senderId) {
    return { ok: false, provider: 'HUBTEL', error: 'SMS_UNAVAILABLE: Hubtel SMS credentials or approved sender ID are not configured.' }
  }
  try {
    const res = await fetch(`${creds.sms.base}/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${creds.sms.clientId}:${creds.sms.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        From: creds.sms.senderId,
        To: [params.to],
        Content: params.body.slice(0, 1600),
        RegisteredDelivery: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, provider: 'HUBTEL', error: `SMS send failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}` }
    }
    const messageId = (body.MessageId ?? body.messageId ?? (body.data as Record<string, unknown> | undefined)?.messageId) as string | undefined
    if (!messageId) return { ok: false, provider: 'HUBTEL', error: 'Provider did not return a message id.' }
    return { ok: true, provider: 'HUBTEL', messageId }
  } catch (err) {
    return { ok: false, provider: 'HUBTEL', error: err instanceof Error ? err.message : 'Network error sending SMS.' }
  }
}

export type SmsDeliveryState = 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'UNKNOWN'

export async function checkSmsDelivery(messageId: string): Promise<{ ok: boolean; state: SmsDeliveryState; detail?: string }> {
  const { resolveHubtelCreds, smsSimulatorActive } = await import('./credentials')
  const creds = await resolveHubtelCreds()
  if (smsSimulatorActive(creds)) {
    // Dev simulator: acceptance then simulated handset delivery (explicitly not a real delivery report).
    return { ok: true, state: 'ACCEPTED' }
  }
  if (!creds.sms.clientId || !creds.sms.clientSecret || !creds.sms.senderId) {
    return { ok: false, state: 'UNKNOWN', detail: 'Hubtel SMS credentials are not configured.' }
  }
  try {
    const res = await fetch(`${creds.sms.base}/v1/messages/${encodeURIComponent(messageId)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${creds.sms.clientId}:${creds.sms.clientSecret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, state: 'UNKNOWN', detail: `HTTP ${res.status}` }
    const status = String(body.MessageStatus ?? body.status ?? '').toUpperCase()
    const delivered = /DELIVERED|DELIVRD/.test(status)
    const failed = /FAILED|REJECTED|EXPIRED|UNDELIV/.test(status)
    return { ok: true, state: delivered ? 'DELIVERED' : failed ? 'FAILED' : 'ACCEPTED', detail: status || undefined }
  } catch (err) {
    return { ok: false, state: 'UNKNOWN', detail: err instanceof Error ? err.message : 'Network error' }
  }
}

/** GSM 03.38 single-SMS segment = 160 chars; Unicode (UCS-2) = 70 chars/segment. */
export function estimateSegments(body: string): { segments: number; encoding: 'GSM-7' | 'UCS-2'; chars: number } {
  const isGsm = /^[\r\n@£$¥èéùìòÇ\nØø\rÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^_{}\\~|€]*$/.test(body)
  const perSegment = isGsm ? 160 : 70
  const chars = [...body].length
  const segments = chars === 0 ? 0 : Math.ceil(chars / perSegment)
  return { segments, encoding: isGsm ? 'GSM-7' : 'UCS-2', chars }
}
