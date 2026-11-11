import { env } from '../env'

/**
 * Hubtel Online Checkout adapter (collections).
 *
 * VERIFICATION STATUS (see docs/PROVIDER_CAPABILITIES.md): implemented against
 * the published v1 Online Checkout contract (POST /items/initiate, Basic auth,
 * JSON callback with ResponseCode "0000" = success, documented 5-minute status
 * check requirement). NOT sandbox-verified — credentials were not supplied with
 * this assignment. Endpoint/field names must be re-verified against
 * https://code.hubtel.com/docs/guides/online-checkout before live use.
 *
 * Contract rules implemented here (from the build brief §9):
 *  - Checkout creation / browser return NEVER marks an order paid.
 *  - Unique references per attempt; persisted before any async processing.
 *  - Callbacks are stored durably and processed idempotently (ProviderEvent dedup).
 *  - No HMAC verification is invented: v1 callback contract has no production
 *    signature — ingress is controlled and final state comes from authenticated
 *    server-to-server verification.
 */

export interface InitiateCheckoutInput {
  reference: string // unique per attempt
  description: string
  amountMinor: number
  currency: string // ISO code; provider field (UI shows ₵ formatting separately)
  callbackUrl: string
  returnUrl: string
  cancellationUrl: string
  buyerPhone?: string | null
  buyerEmail?: string | null
}

export interface InitiateCheckoutResult {
  ok: boolean
  checkoutUrl?: string
  token?: string
  provider: 'HUBTEL' | 'SIMULATOR'
  error?: string
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

export async function initiateCheckout(input: InitiateCheckoutInput): Promise<InitiateCheckoutResult> {
  if (env.paymentsSimulator) {
    // Isolated development simulator: same DB-level workflow, provider boundary simulated.
    return { ok: true, provider: 'SIMULATOR', token: input.reference }
  }
  try {
    const res = await fetch(`${env.hubtel.checkoutBase}/items/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuthHeader(env.hubtel.checkoutClientId, env.hubtel.checkoutClientSecret),
      },
      body: JSON.stringify({
        token: input.reference,
        description: input.description.slice(0, 120),
        callbackUrl: input.callbackUrl,
        returnUrl: input.returnUrl,
        cancellationUrl: input.cancellationUrl,
        amount: (input.amountMinor / 100).toFixed(2),
        generateInvoice: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, provider: 'HUBTEL', error: `Hubtel initiate failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}` }
    }
    const checkoutUrl = (body.checkoutUrl ?? body.url ?? (body.data as Record<string, unknown> | undefined)?.url) as string | undefined
    if (!checkoutUrl) return { ok: false, provider: 'HUBTEL', error: 'Hubtel response did not include a checkout URL.' }
    return { ok: true, provider: 'HUBTEL', checkoutUrl, token: ((body.token as string) ?? input.reference) }
  } catch (err) {
    return { ok: false, provider: 'HUBTEL', error: err instanceof Error ? err.message : 'Network error contacting Hubtel.' }
  }
}

export interface ProviderCallbackPayload {
  responseCode?: string
  transactionId?: string
  amount?: number | string
  currency?: string
  description?: string
  clientReference?: string
  [key: string]: unknown
}

export interface ParsedCallback {
  reference: string | null
  providerPaymentId: string | null
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN'
  amountMinor: number | null
  currency: string | null
  dedupKey: string
  redactedPayload: string
}

/** Parse + redact a Hubtel v1 checkout callback. Sensitive fields never hit routine logs. */
export function parseCallback(payload: ProviderCallbackPayload): ParsedCallback {
  // Field names are accepted in either casing (provider docs use PascalCase in samples;
  // the parser stays tolerant so a documented field-name variant cannot drop a payment).
  const reference = (payload.clientReference ?? payload.ClientReference ?? payload.token ?? payload.Token ?? null) as string | null
  const providerPaymentId = (payload.transactionId ?? payload.TransactionId ?? null) as string | null
  const responseCode = String(payload.responseCode ?? payload.ResponseCode ?? '')
  const amountRaw = payload.amount ?? payload.Amount
  let amountMinor: number | null = null
  if (typeof amountRaw === 'number') amountMinor = Math.round(amountRaw * 100)
  else if (typeof amountRaw === 'string' && amountRaw.trim() !== '') {
    const n = Number(amountRaw)
    if (Number.isFinite(n)) amountMinor = Math.round(n * 100)
  }
  const outcome: ParsedCallback['outcome'] =
    responseCode === '0000' ? 'SUCCESS' : ['0001', '0002', '0003', '0004', '0005'].includes(responseCode) ? 'FAILURE' : responseCode === '' ? 'UNKNOWN' : 'UNKNOWN'
  const dedupKey = `${reference ?? 'none'}:${providerPaymentId ?? 'none'}:${responseCode}:${amountMinor ?? 'na'}`
  const redacted: Record<string, unknown> = { ...payload }
  for (const key of ['cardNumber', 'cardCVV', 'pin', 'otp', 'customerName', 'mobileNumber']) delete redacted[key]
  return {
    reference,
    providerPaymentId,
    outcome,
    amountMinor,
    currency: (payload.currency ?? payload.Currency ?? null) as string | null,
    dedupKey,
    redactedPayload: JSON.stringify(redacted).slice(0, 2000),
  }
}

export interface StatusCheckResult {
  ok: boolean
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN'
  amountMinor: number | null
  providerPaymentId: string | null
  raw?: string
  error?: string
}

/** Authenticated server-to-server status check for reconciliation (documented ≥5 min rule). */
export async function checkTransactionStatus(reference: string, token?: string | null): Promise<StatusCheckResult> {
  if (env.paymentsSimulator) {
    // Simulator: unresolved attempts stay PENDING until the operator resolves them
    // via the simulator panel (or reconciliation marks them UNKNOWN after max checks).
    return { ok: true, outcome: 'PENDING', amountMinor: null, providerPaymentId: null }
  }
  try {
    const path = token ?? reference
    const res = await fetch(`${env.hubtel.checkoutBase}/items/${encodeURIComponent(path)}`, {
      headers: { Accept: 'application/json', Authorization: basicAuthHeader(env.hubtel.checkoutClientId, env.hubtel.checkoutClientSecret) },
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const raw = JSON.stringify(body).slice(0, 1000)
    if (!res.ok) return { ok: false, outcome: 'UNKNOWN', amountMinor: null, providerPaymentId: null, raw, error: `Status check HTTP ${res.status}` }
    const responseCode = String(body.responseCode ?? body.ResponseCode ?? '')
    const amountRaw = body.amount ?? body.Amount
    let amountMinor: number | null = null
    if (typeof amountRaw === 'number') amountMinor = Math.round(amountRaw * 100)
    else if (typeof amountRaw === 'string' && amountRaw.trim() !== '') {
      const n = Number(amountRaw)
      if (Number.isFinite(n)) amountMinor = Math.round(n * 100)
    }
    const outcome: StatusCheckResult['outcome'] = responseCode === '0000' ? 'SUCCESS' : responseCode === '' ? 'UNKNOWN' : 'FAILURE'
    return { ok: true, outcome, amountMinor, providerPaymentId: (body.transactionId as string) ?? null, raw }
  } catch (err) {
    return { ok: false, outcome: 'UNKNOWN', amountMinor: null, providerPaymentId: null, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Payout submission (Hubtel Send Money). Externally blocked without credentials
 * and merchant agreement — see docs/PAYMENTS_AND_SETTLEMENTS.md.
 */
export interface PayoutSubmission {
  ok: boolean
  providerRef?: string
  error?: string
}

export async function submitPayout(params: { reference: string; amountMinor: number; momoNumber: string; recipientName: string; currency: string }): Promise<PayoutSubmission> {
  const configured = Boolean(env.hubtel.sendMoneyClientId && env.hubtel.sendMoneyClientSecret && env.hubtel.sendMoneyAccountId)
  if (!configured) {
    return { ok: false, error: 'PAYOUTS_BLOCKED: Hubtel Send Money credentials/merchant agreement not configured. The payout is recorded and queued for manual provider submission.' }
  }
  try {
    const res = await fetch(`${env.hubtel.sendMoneyBase}/api/v1/merchants/${env.hubtel.sendMoneyAccountId}/sendsmsmoney`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuthHeader(env.hubtel.sendMoneyClientId, env.hubtel.sendMoneyClientSecret),
      },
      body: JSON.stringify({
        CustomerName: params.recipientName.slice(0, 100),
        CustomerMsisdn: params.momoNumber,
        Description: `Payout ${params.reference}`,
        Amount: (params.amountMinor / 100).toFixed(2),
      }),
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: `Hubtel Send Money failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}` }
    return { ok: true, providerRef: String(body.transactionId ?? body.TransactionId ?? params.reference) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error submitting payout.' }
  }
}
