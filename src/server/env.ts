/**
 * Typed startup configuration for iEventPlux.
 *
 * Rules (see docs/ARCHITECTURE.md):
 *  - Boot-critical variables (DATABASE_URL, APP_SECRET in production) fail hard.
 *  - Provider credentials are feature-level: when absent, the affected feature
 *    reports an explicit "unavailable / simulated" status instead of faking success.
 *  - The development simulators can never be forced on in production.
 */

const isProd = process.env.NODE_ENV === 'production'

function boolFromEnv(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes'
}

export interface IntegrationStatus {
  key: string
  name: string
  // implemented → code exists; sandbox/live → verified against provider; blocked → needs credentials/contract
  stage: 'implemented' | 'sandbox-verified' | 'live-verified' | 'externally-blocked'
  configured: boolean
  mode: 'real' | 'simulated' | 'unavailable'
  detail: string
}

export interface Env {
  isProd: boolean
  databaseUrl: string
  appSecret: string
  appUrl: string
  hubtel: {
    checkoutBase: string
    checkoutClientId: string
    checkoutClientSecret: string
    sendMoneyBase: string
    sendMoneyClientId: string
    sendMoneyClientSecret: string
    sendMoneyAccountId: string
    smsBase: string
    smsClientId: string
    smsClientSecret: string
    smsSenderId: string
  }
  paymentsSimulator: boolean
  smsSimulator: boolean
  videoProvider: 'cloudflare-stream' | 'simulator'
  cfStream: { apiToken: string; accountId: string }
  smtp: { host: string; port: number; user: string; pass: string; from: string }
  worker: { port: number; secret: string }
  realtime: { port: number; secret: string }
  aiEnabled: boolean
}

const checkoutConfigured = Boolean(process.env.HUBTEL_CHECKOUT_CLIENT_ID && process.env.HUBTEL_CHECKOUT_CLIENT_SECRET)
const sendMoneyConfigured = Boolean(
  process.env.HUBTEL_SENDMONEY_CLIENT_ID && process.env.HUBTEL_SENDMONEY_CLIENT_SECRET && process.env.HUBTEL_SENDMONEY_ACCOUNT_ID
)
const smsConfigured = Boolean(process.env.HUBTEL_SMS_CLIENT_ID && process.env.HUBTEL_SMS_CLIENT_SECRET && process.env.HUBTEL_SMS_SENDER_ID)
const videoConfigured = Boolean(process.env.CF_STREAM_API_TOKEN && process.env.CF_STREAM_ACCOUNT_ID)
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)

const paymentsSimFlag = process.env.PAYMENTS_SIMULATOR ?? 'auto'
const smsSimFlag = process.env.SMS_SIMULATOR ?? 'auto'

// An explicit simulator force-on is refused in production (isolated simulator rule).
if (isProd && (boolFromEnv(paymentsSimFlag) || boolFromEnv(smsSimFlag))) {
  throw new Error('PAYMENTS_SIMULATOR / SMS_SIMULATOR cannot be enabled in production. Remove the override and configure real provider credentials.')
}

export const env: Env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL ?? '',
  appSecret: process.env.APP_SECRET ?? (isProd ? '' : 'dev-only-insecure-secret'),
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  hubtel: {
    checkoutBase: (process.env.HUBTEL_CHECKOUT_BASE ?? 'https://pay.hubtel.com').replace(/\/$/, ''),
    checkoutClientId: process.env.HUBTEL_CHECKOUT_CLIENT_ID ?? '',
    checkoutClientSecret: process.env.HUBTEL_CHECKOUT_CLIENT_SECRET ?? '',
    sendMoneyBase: (process.env.HUBTEL_SENDMONEY_BASE ?? 'https://app.hubtel.com').replace(/\/$/, ''),
    sendMoneyClientId: process.env.HUBTEL_SENDMONEY_CLIENT_ID ?? '',
    sendMoneyClientSecret: process.env.HUBTEL_SENDMONEY_CLIENT_SECRET ?? '',
    sendMoneyAccountId: process.env.HUBTEL_SENDMONEY_ACCOUNT_ID ?? '',
    smsBase: (process.env.HUBTEL_SMS_BASE ?? 'https://smsc.hubtel.com').replace(/\/$/, ''),
    smsClientId: process.env.HUBTEL_SMS_CLIENT_ID ?? '',
    smsClientSecret: process.env.HUBTEL_SMS_CLIENT_SECRET ?? '',
    smsSenderId: process.env.HUBTEL_SMS_SENDER_ID ?? '',
  },
  paymentsSimulator: paymentsSimFlag === 'auto' ? !checkoutConfigured : boolFromEnv(paymentsSimFlag),
  smsSimulator: smsSimFlag === 'auto' ? !smsConfigured : boolFromEnv(smsSimFlag),
  videoProvider: videoConfigured ? 'cloudflare-stream' : 'simulator',
  cfStream: { apiToken: process.env.CF_STREAM_API_TOKEN ?? '', accountId: process.env.CF_STREAM_ACCOUNT_ID ?? '' },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'no-reply@ieventplux.local',
  },
  worker: { port: Number(process.env.WORKER_PORT ?? 3001), secret: process.env.WORKER_SECRET ?? 'dev-worker-secret' },
  realtime: { port: Number(process.env.REALTIME_PORT ?? 3003), secret: process.env.REALTIME_SECRET ?? 'dev-realtime-secret' },
  aiEnabled: (process.env.AI_CONCIERGE_ENABLED ?? 'true') !== 'false',
}

export function envValidation() {
  const errors: string[] = []
  const warnings: string[] = []
  if (!env.databaseUrl) errors.push('DATABASE_URL is required.')
  if (isProd && !process.env.APP_SECRET) errors.push('APP_SECRET is required in production.')
  if (!isProd && !process.env.APP_SECRET) warnings.push('APP_SECRET not set — using an insecure development default.')
  if (!checkoutConfigured) warnings.push('HUBTEL_CHECKOUT_CLIENT_ID / SECRET not set — payments run in the isolated development simulator and real charges are impossible.')
  if (!sendMoneyConfigured) warnings.push('HUBTEL_SENDMONEY_* not set — payouts are recorded and tracked but cannot be submitted to a provider.')
  if (!smsConfigured) warnings.push('HUBTEL_SMS_* / HUBTEL_SMS_SENDER_ID not set — SMS runs in the development simulator (no live messages).')
  if (!videoConfigured) warnings.push('CF_STREAM_* not set — live delivery uses the clearly-labelled synthetic stream renderer.')
  if (!smtpConfigured) warnings.push('SMTP_* not set — email delivery is queued with truthful "SUPPRESSED" status.')
  return { errors, warnings }
}

export function integrationStatuses(): IntegrationStatus[] {
  return [
    {
      key: 'hubtel-checkout',
      name: 'Hubtel Online Checkout (collections)',
      stage: 'implemented',
      configured: checkoutConfigured,
      mode: env.paymentsSimulator ? 'simulated' : 'real',
      detail: checkoutConfigured
        ? 'Real adapter active (initiate/callback/reconciliation paths). Sandbox verification with provider credentials still pending.'
        : 'Credentials absent — isolated dev simulator active. Orders, callbacks, reconciliation and ledger all run for real against the database; only the provider boundary is simulated.',
    },
    {
      key: 'hubtel-sendmoney',
      name: 'Hubtel Send Money (payouts)',
      stage: 'externally-blocked',
      configured: sendMoneyConfigured,
      mode: sendMoneyConfigured ? 'real' : 'unavailable',
      detail: sendMoneyConfigured
        ? 'Adapter configured; provider submission requires sandbox verification before live payouts.'
        : 'Credentials + merchant agreement required. Payout requests/approvals/journals work; provider submission is blocked and clearly labelled.',
    },
    {
      key: 'hubtel-sms',
      name: 'Hubtel SMS',
      stage: 'implemented',
      configured: smsConfigured,
      mode: env.smsSimulator ? 'simulated' : 'real',
      detail: smsConfigured
        ? 'Real adapter active (send + delivery status). Verify the approved sender ID with the provider before live sends.'
        : 'Credentials absent — dev simulator marks messages ACCEPTED→DELIVERED locally. API acceptance is never shown as confirmed handset delivery.',
    },
    {
      key: 'cloudflare-stream',
      name: 'Cloudflare Stream (live video)',
      stage: 'externally-blocked',
      configured: videoConfigured,
      mode: env.videoProvider === 'simulator' ? 'simulated' : 'real',
      detail:
        env.videoProvider === 'simulator'
          ? 'No CF_STREAM credentials — entitlement-gated synthetic playback is used and labelled. Ingest keys are generated but not live.'
          : 'Credentials present — adapter active; requires sandbox verification of ingest/playback before live events.',
    },
    {
      key: 'smtp-email',
      name: 'SMTP email',
      stage: 'implemented',
      configured: smtpConfigured,
      mode: smtpConfigured ? 'real' : 'unavailable',
      detail: smtpConfigured ? 'SMTP configured.' : 'SMTP_HOST not set — email messages are queued with SUPPRESSED status (truthful, not fake success).',
    },
    {
      key: 'ai-concierge',
      name: 'AI concierge (LLM + voice)',
      stage: 'implemented',
      configured: true,
      mode: 'real',
      detail: env.aiEnabled
        ? 'Z.ai SDK chat/ASR/TTS active for the attendee concierge (text + real-time voice conversation).'
        : 'Disabled via AI_CONCIERGE_ENABLED=false.',
    },
    {
      key: 'realtime',
      name: 'Realtime service (socket.io)',
      stage: 'implemented',
      configured: true,
      mode: 'real',
      detail: 'Live chat / presence / notification push via the gateway WebSocket route.',
    },
  ]
}
