import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { initiatePaymentForOrder } from '@/server/services/payments'
import { env } from '@/server/env'

/** POST /api/v1/payments/initiate — create a payment attempt + provider checkout. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    rateLimit(req, 'payments', 20, 60_000)
    const user = await requireUser()
    const body = await readJson<{ orderReference?: string }>(req)
    const result = await initiatePaymentForOrder(String(body.orderReference ?? ''), user.id)
    // Round 14: provider mode reflects the dynamic simulator gate (env or admin-saved creds).
    const { resolveSimulatorModes } = await import('@/server/hubtel/credentials')
    const modes = await resolveSimulatorModes()
    return jsonOk({
      ...result,
      simulatorNotice:
        result.provider === 'SIMULATOR'
          ? 'DEVELOPMENT SIMULATOR — no real money moves. Save Hubtel keys in Admin → Integrations (or set HUBTEL_CHECKOUT_CLIENT_ID/SECRET) to activate real checkout.'
          : null,
      providerMode: modes.paymentsSimulator ? 'simulated' : 'real',
    })
  })
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const reference = url.searchParams.get('reference')
    if (!reference) throw errors.badRequest('reference is required')
    const { db } = await import('@/lib/db')
    const attempt = await db.paymentAttempt.findUnique({
      where: { reference },
      select: { status: true, provider: true, amountMinor: true, currency: true, callbackCount: true, reconcileCheckCount: true, orderId: true, invoiceId: true },
    })
    if (!attempt) throw errors.notFound('Payment attempt not found.')
    const order = attempt.orderId
      ? await db.order.findUnique({ where: { id: attempt.orderId }, select: { status: true, reference: true } })
      : null
    return jsonOk({ attempt, order })
  })
}
