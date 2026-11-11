import { NextRequest, NextResponse } from 'next/server'
import { intakeCallback } from '@/server/services/payments'

/**
 * POST /api/v1/payments/callback — Hubtel v1 checkout callback.
 *
 * Contract rules implemented (brief §9):
 *  - Stored durably (ProviderEvent with dedup key) and acknowledged promptly (HTTP 200).
 *  - Business effects processed asynchronously + idempotently by the worker.
 *  - The v1 published callback contract defines no production verification signature —
 *    no HMAC is invented; final authority is server-to-server verification + amount checks.
 *  - A browser return or forged callback can never mark an order paid by itself.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const result = await intakeCallback(payload)
    // Always acknowledge quickly so the provider does not retry-storm us; dedup handles replays.
    return NextResponse.json({ received: true, result: result.result })
  } catch (err) {
    console.error('[payments.callback] intake error', err instanceof Error ? err.message : err)
    // Acknowledge to avoid provider retries; the reconciliation sweep covers gaps.
    return NextResponse.json({ received: true, result: 'INTAKE_ERROR' })
  }
}

export async function GET(req: NextRequest) {
  void req
  return NextResponse.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Callbacks are POSTed by the provider.' } }, { status: 405 })
}
