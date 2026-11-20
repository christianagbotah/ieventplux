import { describe, expect, test } from 'bun:test'
import type { IntegrationStatus } from './env'
import { resolvedProviderValidation } from './provider-health'

const provider = (key: string, configured: boolean): IntegrationStatus => ({
  key, name: key, stage: 'implemented', configured,
  mode: configured ? 'real' : 'unavailable', detail: '',
})

const missing = [
  'HUBTEL_CHECKOUT_CLIENT_ID / SECRET not set — checkout unavailable; production never simulates a successful charge.',
  'HUBTEL_SENDMONEY_* not set — payouts are recorded and tracked but cannot be submitted to a provider.',
  'HUBTEL_SMS_* / HUBTEL_SMS_SENDER_ID not set — production SMS delivery unavailable; no simulated delivery.',
  'SMTP_* not set — email delivery is queued with truthful "SUPPRESSED" status.',
  'CF_STREAM_* not set — live video is unavailable.',
  'Smile ID biometric verification is disabled.',
]

describe('provider health reflects admin-saved configuration', () => {
  test('removes only misleading warnings for provider credentials saved in database', () => {
    const input = { errors: ['DATABASE_URL is required.'], warnings: [...missing] }
    const result = resolvedProviderValidation(input, [
      provider('hubtel-checkout', true), provider('hubtel-sendmoney', true),
      provider('hubtel-sms', true), provider('smtp-email', true),
    ])
    expect(result.errors).toEqual(input.errors)
    expect(result.warnings).toEqual(missing.slice(4))
    expect(input.warnings).toEqual(missing)
  })

  test('retains warnings for incomplete and unknown providers', () => {
    const result = resolvedProviderValidation({ errors: [], warnings: [...missing] }, [
      provider('hubtel-sms', false), provider('smtp-email', false),
      provider('unknown', true),
    ])
    expect(result.warnings).toEqual(missing)
  })

  test('updates each channel independently without implying successful delivery', () => {
    const result = resolvedProviderValidation({ errors: [], warnings: [...missing] }, [
      provider('smtp-email', true), provider('hubtel-checkout', false),
    ])
    expect(result.warnings).toEqual(missing.filter((warning) => !warning.startsWith('SMTP_*')))
  })
})
