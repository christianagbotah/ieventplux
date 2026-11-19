import { describe, expect, test } from 'bun:test'
import { smileDecision, smileProviderStatus } from './smile'

describe('Smile ID provider is strictly gated', () => {
  test('not ready without server credentials, privacy notice and explicit switch', () => {
    const status = smileProviderStatus({})
    expect(status.ready).toBe(false)
    expect(status.configured).toBe(false)
    expect(status.mode).toBe('sandbox')
    expect(status.requirements.length).toBe(4)
  })
  test('credentials alone never activate biometric uploads', () => {
    const status = smileProviderStatus({ SMILE_ID_PARTNER_ID: '2', SMILE_ID_API_KEY: 'test-secret' })
    expect(status.ready).toBe(false)
    expect(status.enabled).toBe(false)
  })
  test('configured sandbox requires HTTPS notice and enablement', () => {
    const configured = { SMILE_ID_PARTNER_ID: '2', SMILE_ID_API_KEY: 'secret', SMILE_ID_BIOMETRIC_ENABLED: '1', SMILE_ID_PRIVACY_NOTICE_URL: 'https://example.com/biometric-privacy', SMILE_ID_ENVIRONMENT: 'sandbox' }
    expect(smileProviderStatus(configured).ready).toBe(true)
    expect(smileProviderStatus({ ...configured, SMILE_ID_PRIVACY_NOTICE_URL: 'http://example.com' }).ready).toBe(false)
    expect(smileProviderStatus({ ...configured, SMILE_ID_ENVIRONMENT: 'invalid' }).ready).toBe(false)
    expect(smileProviderStatus({ ...configured, SMILE_ID_PARTNER_ID: 'not-a-partner' }).ready).toBe(false)
  })
  test('unknown and pending statuses never approve a user', () => {
    expect(smileDecision('clear')).toBe('CLEAR')
    expect(smileDecision('attention')).toBe('REVIEW_REQUIRED')
    expect(smileDecision('block')).toBe('BLOCK')
    expect(smileDecision('error')).toBe('ERROR')
    expect(smileDecision('not_found')).toBe('PROCESSING')
    expect(smileDecision('garbage')).toBe('PROCESSING')
  })
})
