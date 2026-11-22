import type { IntegrationStatus } from './env'

type Validation = { errors: string[]; warnings: string[] }

/**
 * The admin can save Hubtel and SMTP credentials to the database, independently
 * of environment variables. Only suppress an environment-missing warning when
 * the actual resolved provider configuration indicates credentials are present.
 * This does not mean external delivery or financial processing has been tested.
 */
const providerWarningPrefixes: Record<string, string> = {
  'hubtel-checkout': 'HUBTEL_CHECKOUT_CLIENT_ID / SECRET not set',
  'hubtel-sendmoney': 'HUBTEL_SENDMONEY_* not set',
  'hubtel-sms': 'HUBTEL_SMS_* / HUBTEL_SMS_SENDER_ID not set',
  'smtp-email': 'SMTP_* not set',
}

export function resolvedProviderValidation(
  validation: Validation,
  integrations: readonly IntegrationStatus[],
): Validation {
  const configuredPrefixes = integrations
    .filter((integration) => integration.configured)
    .map((integration) => providerWarningPrefixes[integration.key])
    .filter((prefix): prefix is string => Boolean(prefix))

  return {
    errors: [...validation.errors],
    warnings: validation.warnings.filter(
      (warning) => !configuredPrefixes.some((prefix) => warning.startsWith(prefix)),
    ),
  }
}
