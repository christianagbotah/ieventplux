import { env } from '../env'
import { paymentsSimulatorActive, resolveHubtelCreds, type ProbeResult, type ResolvedHubtelCreds } from './credentials'

/**
 * Hubtel Online Checkout adapter (collections).
 *
 * VERIFICATION STATUS (see docs/PROVIDER_CAPABILITIES.md): implemented against
 * the published v1 Online Checkout contract (POST /items/initiate, Basic auth,
 * JSON callback with ResponseCode "0000" = success, documented 5-minute status
 * check requirement). NOT sandbox-verified — credentials were not supplied with
 * this assignment. Endpoint/field names must be re-verified against
 * https://developers.hubtel.com/docs/business/getting_started/authentication
 * before live use. The round-14 connection probe (probeCheckoutConnection)
 * performs a real GHS 1.00 initiate so the HTTP verdict gives empirical
 * evidence about auth + endpoint shape the moment credentials exist.
 *
 * Contract rules implemented here (from the build brief §9):
 *  - Checkout creation / browser return NEVER marks an order paid.
 *  - Unique references per attempt; persisted before any async processing.
 *  - Callbacks are stored durably and processed idempotently (ProviderEvent dedup).
 *  - No HMAC verification is invented: v1 callback contract has no production
 *    signature — ingress is controlled and final state comes from authenticated
 *    server-to-server verification.
 *
 * Round 14: credentials resolve per-request (admin console DB values override
 * env), and the simulator gate is dynamic — connecting Hubtel in Admin →
 * Integrations switches checkout to the real provider without a redeploy.
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

export async function initiateCheckout(input: InitiateCheckoutInput, creds?: ResolvedHubtelCreds): Promise<InitiateCheckoutResult> {
  const resolved = creds ?? (await resolveHubtelCreds())
  if (paymentsSimulatorActive(resolved)) {
    // Isolated development simulator: same DB-level workflow, provider boundary simulated.
    return { ok: true, provider: 'SIMULATOR', token: input.reference }
  }
  try {
    const res = await fetch(`${resolved.checkout.base}/items/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuthHeader(resolved.checkout.clientId, resolved.checkout.clientSecret),
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
export async function checkTransactionStatus(reference: string, token?: string | null, creds?: ResolvedHubtelCreds): Promise<StatusCheckResult> {
  const resolved = creds ?? (await resolveHubtelCreds())
  if (paymentsSimulatorActive(resolved)) {
    // Simulator: unresolved attempts stay PENDING until the operator resolves them
    // via the simulator panel (or reconciliation marks them UNKNOWN after max checks).
    return { ok: true, outcome: 'PENDING', amountMinor: null, providerPaymentId: null }
  }
  try {
    const path = token ?? reference
    const res = await fetch(`${resolved.checkout.base}/items/${encodeURIComponent(path)}`, {
      headers: { Accept: 'application/json', Authorization: basicAuthHeader(resolved.checkout.clientId, resolved.checkout.clientSecret) },
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

export async function submitPayout(params: { reference: string; amountMinor: number; momoNumber: string; recipientName: string; currency: string }, creds?: ResolvedHubtelCreds): Promise<PayoutSubmission> {
  const resolved = creds ?? (await resolveHubtelCreds())
  if (paymentsSimulatorActive(resolved)) {
    // Dev simulator (round 15): the transfer "leaves" instantly and the payout
    // status poll job transitions SUBMITTED → PAID after a short synthetic
    // delay, so the whole payout lifecycle is exercisable without credentials.
    return { ok: true, providerRef: `SIM-${params.reference}` }
  }
  const configured = Boolean(resolved.sendMoney.clientId && resolved.sendMoney.clientSecret && resolved.sendMoney.accountId)
  if (!configured) {
    return { ok: false, error: 'PAYOUTS_BLOCKED: Hubtel Send Money credentials/merchant agreement not configured. The payout is recorded and queued for manual provider submission.' }
  }
  try {
    const res = await fetch(`${resolved.sendMoney.base}/api/v1/merchants/${resolved.sendMoney.accountId}/sendsmsmoney`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuthHeader(resolved.sendMoney.clientId, resolved.sendMoney.clientSecret),
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

/**
 * Round 15: Send Money transfer status probe used by the PAYOUT_STATUS_POLL
 * worker sweep. The transaction-status endpoint is NOT sandbox-verified (the
 * docs portal sits behind a login this environment cannot complete), so the
 * parser stays tolerant and a 404/405 NEVER produces a verdict — it records
 * STATUS_ENDPOINT_UNVERIFIED and the payout stays SUBMITTED for manual
 * confirmation. Guessing a verdict here could fake money movement.
 */
export interface SendMoneyStatusResult {
  ok: boolean
  outcome: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN'
  httpStatus: number | null
  detail?: string
}

export async function checkSendMoneyStatus(providerRef: string, creds?: ResolvedHubtelCreds): Promise<SendMoneyStatusResult> {
  const resolved = creds ?? (await resolveHubtelCreds())
  if (providerRef.startsWith('SIM-')) {
    // Simulator: synthetic completion delay mirrors the SMS simulator behaviour.
    return { ok: true, outcome: 'SUCCESS', httpStatus: null, detail: 'Simulated transfer completion (dev simulator)' }
  }
  if (!resolved.sendMoney.clientId || !resolved.sendMoney.clientSecret || !resolved.sendMoney.accountId) {
    return { ok: false, outcome: 'UNKNOWN', httpStatus: null, detail: 'Send Money credentials not configured.' }
  }
  try {
    const res = await fetch(`${resolved.sendMoney.base}/api/v1/merchants/${resolved.sendMoney.accountId}/transactions/${encodeURIComponent(providerRef)}`, {
      headers: { Accept: 'application/json', Authorization: basicAuthHeader(resolved.sendMoney.clientId, resolved.sendMoney.clientSecret) },
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 404 || res.status === 405) {
      return { ok: false, outcome: 'UNKNOWN', httpStatus: res.status, detail: 'STATUS_ENDPOINT_UNVERIFIED: no transaction resource at this path — status polling needs calibration; manual confirmation remains available.' }
    }
    if (!res.ok) return { ok: false, outcome: 'UNKNOWN', httpStatus: res.status, detail: `Status check HTTP ${res.status}` }
    const raw = JSON.stringify(body).slice(0, 400)
    const status = String(body.status ?? body.Status ?? body.transactionStatus ?? body.TransactionStatus ?? '').toUpperCase()
    const responseCode = String(body.responseCode ?? body.ResponseCode ?? '')
    if (status.includes('SUCCESS') || status === 'COMPLETED' || status === 'PAID' || responseCode === '0000') {
      return { ok: true, outcome: 'SUCCESS', httpStatus: res.status, detail: raw }
    }
    if (status.includes('FAIL') || status.includes('REVERS') || ['0001', '0002', '0003', '0004', '0005'].includes(responseCode)) {
      return { ok: true, outcome: 'FAILED', httpStatus: res.status, detail: raw }
    }
    return { ok: true, outcome: 'PENDING', httpStatus: res.status, detail: raw }
  } catch (err) {
    return { ok: false, outcome: 'UNKNOWN', httpStatus: null, detail: err instanceof Error ? err.message : 'Network error checking payout status.' }
  }
}

/**
 * Round-14 connection probe: performs ONE real checkout initiate for GHS 1.00
 * ("iEventPlux connectivity test"). Unpaid checkout sessions simply expire at
 * the provider, so the probe leaves no live charge. The verdict is empirical:
 * auth accepted/rejected, endpoint found/missing, contract shape known/unknown.
 * Used by Admin → Integrations "Test connection".
 */
export async function probeCheckoutConnection(appUrl: string, creds?: ResolvedHubtelCreds): Promise<ProbeResult> {
  const resolved = creds ?? (await resolveHubtelCreds())
  const reference = `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  if (!resolved.checkout.clientId || !resolved.checkout.clientSecret) {
    return { at: new Date().toISOString(), ok: false, verdict: 'NOT_CONFIGURED', httpStatus: null, detail: 'No client ID / secret saved yet.', snippet: '' }
  }
  try {
    const res = await fetch(`${resolved.checkout.base}/items/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuthHeader(resolved.checkout.clientId, resolved.checkout.clientSecret),
      },
      body: JSON.stringify({
        token: reference,
        description: 'iEventPlux connectivity test',
        callbackUrl: `${appUrl}/api/v1/payments/callback`,
        returnUrl: `${appUrl}/api/v1/payments/return/${reference}`,
        cancellationUrl: `${appUrl}/`,
        amount: '1.00',
        generateInvoice: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const bodyText = (await res.text().catch(() => '')) || ''
    let snippet = bodyText.slice(0, 400)
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      /* non-JSON response — snippet is shown raw for calibration */
    }
    const checkoutUrl = (body.checkoutUrl ?? body.url ?? (body.data as Record<string, unknown> | undefined)?.url) as string | undefined
    if (res.status === 401 || res.status === 403) {
      return { at: new Date().toISOString(), ok: false, verdict: 'AUTH_REJECTED', httpStatus: res.status, detail: 'Hubtel rejected the credentials. Re-check the client ID and client secret.', snippet }
    }
    if (res.ok && checkoutUrl) {
      return { at: new Date().toISOString(), ok: true, verdict: 'AUTH_OK_CONTRACT_OK', httpStatus: res.status, detail: 'Hubtel authenticated and returned a checkout URL — the documented v1 contract matches.', snippet }
    }
    if (res.ok) {
      return { at: new Date().toISOString(), ok: false, verdict: 'AUTH_OK_SHAPE_DIFFERS', httpStatus: res.status, detail: 'Authenticated, but the response has no recognizable checkout URL — the endpoint contract differs from the implemented v1 shape. Calibrate from the snippet.', snippet }
    }
    if (res.status === 404 || res.status === 405) {
      return { at: new Date().toISOString(), ok: false, verdict: 'ENDPOINT_NOT_FOUND', httpStatus: res.status, detail: 'Credentials were not rejected, but this endpoint path does not exist on the provider — the base URL or path needs calibration.', snippet }
    }
    return { at: new Date().toISOString(), ok: false, verdict: `HTTP_${res.status}`, httpStatus: res.status, detail: 'Unexpected provider response — inspect the snippet.', snippet }
  } catch (err) {
    return {
      at: new Date().toISOString(),
      ok: false,
      verdict: 'UNREACHABLE',
      httpStatus: null,
      detail: err instanceof Error ? err.message : 'Network error contacting Hubtel.',
      snippet: '',
    }
  }
}
