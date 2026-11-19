/** Smile ID v3: server-side only. No face images, ID numbers or API keys are logged.
 * A successful provider result is independent of platform organizer approval.
 */
import { SmileID, Consent, type DocumentVerificationParams, SmileIDError } from '@smileid/usesmileid-nodejs'
import { errors } from '@/server/api'

export type SmileProviderState = 'CLEAR' | 'BLOCK' | 'REVIEW_REQUIRED' | 'PROCESSING' | 'ERROR'
export type SmileStatusView = {
  provider: 'SMILE_ID'
  configured: boolean
  enabled: boolean
  ready: boolean
  mode: 'sandbox' | 'production'
  requirements: string[]
  noticeUrl: string | null
}

/** A separate explicit switch prevents accidental biometrics transfer on deploy. */
export function smileProviderStatus(environment: Record<string, string | undefined> = process.env): SmileStatusView {
  const requirements: string[] = []
  if (!/^\d+$/.test(environment.SMILE_ID_PARTNER_ID?.trim() ?? '')) requirements.push('Valid numeric partner ID')
  if (!environment.SMILE_ID_API_KEY?.trim()) requirements.push('Provider API key')
  const rawNotice = environment.SMILE_ID_PRIVACY_NOTICE_URL?.trim() ?? ''
  let noticeUrl: string | null = null
  try {
    const parsed = new URL(rawNotice)
    if (parsed.protocol === 'https:' && parsed.hostname.includes('.') && !parsed.username && !parsed.password) noticeUrl = parsed.toString()
  } catch { /* Not a valid privacy notice */ }
  if (!noticeUrl) requirements.push('Public HTTPS biometric privacy notice')
  const mode = environment.SMILE_ID_ENVIRONMENT === 'production' ? 'production' : 'sandbox'
  if (environment.SMILE_ID_ENVIRONMENT && !['sandbox', 'production'].includes(environment.SMILE_ID_ENVIRONMENT)) requirements.push('Valid environment mode')
  if (environment.SMILE_ID_BIOMETRIC_ENABLED !== '1') requirements.push('Explicit biometric provider enablement')
  return {
    provider: 'SMILE_ID',
    configured: Boolean(environment.SMILE_ID_PARTNER_ID && environment.SMILE_ID_API_KEY),
    enabled: environment.SMILE_ID_BIOMETRIC_ENABLED === '1',
    ready: requirements.length === 0,
    mode,
    requirements,
    noticeUrl,
  }
}

export function smileProviderClient(): SmileID {
  const status = smileProviderStatus()
  if (!status.ready) throw errors.unavailable('IDENTITY_PROVIDER_UNAVAILABLE', 'Automated ID and liveness checks are not currently available. Continue with private document upload and manual review.')
  return new SmileID({
    partnerId: process.env.SMILE_ID_PARTNER_ID!.replace(/^0+(?=\d)/, ''),
    apiKey: process.env.SMILE_ID_API_KEY!,
    environment: status.mode,
    timeout: 30_000,
    maxRetries: 1,
  })
}

export function smileDecision(input: string): SmileProviderState {
  switch (input.toLowerCase()) {
    case 'clear': return 'CLEAR'
    case 'block': return 'BLOCK'
    case 'attention': return 'REVIEW_REQUIRED'
    case 'error': return 'ERROR'
    default: return 'PROCESSING'
  }
}

export function providerApiError(error: unknown): Error {
  if (error instanceof SmileIDError) {
    const status = error.statusCode
    console.error('[smile-id] Provider request failed', { status, code: error.code, requestId: error.requestId })
    if (status === 402) return errors.unavailable('IDENTITY_PROVIDER_PAYMENT', 'Identity checks are temporarily unavailable because the provider account needs funding.')
    if (status === 401 || status === 403) return errors.unavailable('IDENTITY_PROVIDER_AUTH', 'Identity verification provider authorization failed. Contact platform support.')
    if (status === 429) return errors.rateLimited('The identity provider is busy. Please retry later.')
    if (status === 400 || status === 415) return errors.badRequest('The provider could not process the identity capture. Please retake clear photos using the guided camera and retry.')
  }
  console.error('[smile-id] Provider connection or unexpected failure', error instanceof Error ? error.name : 'unknown')
  return errors.unavailable('IDENTITY_PROVIDER_ERROR', 'Automated identity checks are temporarily unavailable. You may continue with manual verification.')
}

export async function submitSmileDocumentCheck(input: Omit<DocumentVerificationParams, 'consent'> & { noticeUrl: string; grantedAt: Date }): Promise<string> {
  const client = smileProviderClient()
  try {
    const { noticeUrl, grantedAt, ...check } = input
    const accepted = await client.documents.verify({
      ...check,
      consent: Consent.granted({
        grantedAt, noticeLanguage: 'EN', noticePrivacyPolicyUrl: noticeUrl,
      }),
    })
    if (!accepted.isAccepted || !accepted.jobId) throw errors.unavailable('IDENTITY_PROVIDER_ERROR', 'The identity provider did not accept this check.')
    return accepted.jobId
  } catch (error) { throw providerApiError(error) }
}

export async function retrieveSmileDecision(externalJobId: string): Promise<SmileProviderState> {
  const client = smileProviderClient()
  try {
    const result = await client.verifications.retrieve(externalJobId, { timeout: 15_000 })
    return smileDecision(result.status)
  } catch (error) { throw providerApiError(error) }
}
