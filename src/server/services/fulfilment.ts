import { db } from '../../lib/db'
import { confirmedAmountMatches } from '../hubtel/security-policy'
import { env } from '../env'
import { errors } from '../api'
import { ticketCode } from '../ids'
import { postJournal, ensureOrgAccounts, ensurePlatformAccounts } from '../ledger'
import { notifyUser, queueMessage } from './notify'
import { formatMoney } from '../money'

/**
 * Idempotent payment fulfilment.
 *
 * Guarantees (brief §8/§9, acceptance cases 3–7):
 *  - A ticket is issued only after authoritative payment confirmation or valid free RSVP.
 *  - Repeated callbacks / duplicate processing produce ONE business fulfilment
 *    (order status check + ledger idempotency key + unique ticket codes).
 *  - Late success against expired inventory: fulfil only if capacity can still be
 *    reserved, otherwise route to the explicit exception/refund workflow — never
 *    oversell and never tell a charged customer the payment vanished.
 *  - Multiple successful attempts on one order are detected and routed for resolution.
 */

export interface FulfilOutcome {
  outcome: 'FULFILLED' | 'ALREADY_PAID' | 'EXCEPTION_CAPACITY' | 'REJECTED'
  detail: string
}

export async function fulfilPaidOrder(params: { orderId: string; paymentAttemptId: string; amountMinor: number }): Promise<FulfilOutcome> {
  const { orderId, paymentAttemptId, amountMinor } = params
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, event: true, reservations: true, payments: true } })
  if (!order) throw errors.notFound('Order not found.')

  // Idempotency: another attempt already paid this order → duplicate payment case.
  const successAttempts = order.payments.filter((p) => p.status === 'SUCCESS' && p.id !== paymentAttemptId)
  if (order.status === 'PAID' || successAttempts.length > 0) {
    await db.refundCase.create({
      data: {
        orderId: order.id,
        requestedBy: 'system:duplicate-payment',
        type: 'FULL',
        amountMinor,
        status: 'REQUESTED',
        reason: `Multiple successful payments for order ${order.reference}. Excess payment detected and routed for refund resolution.`,
      },
    })
    await db.order.update({ where: { id: order.id }, data: { status: 'EXCEPTION_REVIEW', exceptionReason: 'Duplicate successful payment attempts.' } })
    await notifyUser({
      userId: order.userId ?? '',
      type: 'PAYMENT_REVIEW',
      title: 'Payment under review',
      body: `We received more than one payment for order ${order.reference}. Our team will resolve the excess immediately — your money is accounted for.`,
      link: `#/order/${order.reference}`,
    }).catch(() => {})
    return { outcome: 'ALREADY_PAID', detail: 'Order already paid; excess payment routed to refund workflow.' }
  }

  if (order.status === 'REFUNDED' || order.status === 'REFUND_PENDING') {
    return { outcome: 'REJECTED', detail: 'Order already refunded; payment routed for resolution.' }
  }

  // Late payment vs reservations: if reservations expired, try to re-reserve capacity.
  const now = new Date()
  const usable = order.reservations.filter((r) => r.status === 'ACTIVE' && r.expiresAt > now)
  if (usable.length === 0) {
    // Attempt capacity re-reservation (never oversell: quota re-checked transactionally).
    const canReserve = await db.$transaction(async (tx) => {
      for (const item of order.items) {
        const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } })
        if (!tt) return false
        if (tt.quota > 0 && tt.soldCount + tt.reservedCount + item.qty > tt.quota) return false
      }
      for (const item of order.items) {
        await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reservedCount: { increment: item.qty } } })
        const res = order.reservations.find((r) => r.ticketTypeId === item.ticketTypeId && r.status !== 'CONSUMED')
        if (res) {
          await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: 'ACTIVE', expiresAt: new Date(now.getTime() + 60_000) } })
        } else {
          await tx.inventoryReservation.create({
            data: { orderId: order.id, ticketTypeId: item.ticketTypeId, qty: item.qty, status: 'ACTIVE', expiresAt: new Date(now.getTime() + 60_000) },
          })
        }
      }
      return true
    })
    if (!canReserve) {
      // Capacity gone: explicit exception + refund workflow. Money stays accounted.
      await db.refundCase.create({
        data: {
          orderId: order.id,
          requestedBy: 'system:late-payment',
          type: 'FULL',
          amountMinor,
          status: 'REQUESTED',
          reason: `Late payment after reservation expiry for order ${order.reference}; capacity exhausted.`,
        },
      })
      await db.order.update({
        where: { id: order.id },
        data: { status: 'EXCEPTION_REVIEW', exceptionReason: 'Late payment with exhausted capacity; routed to refund.' },
      })
      await notifyUser({
        userId: order.userId ?? '',
        type: 'PAYMENT_REVIEW',
        title: 'Payment received — tickets unavailable',
        body: `Your payment for ${order.event.title} arrived after the ticket hold expired and the event is now full. A refund of ${formatMoney(amountMinor)} has been opened automatically.`,
        link: `#/order/${order.reference}`,
      }).catch(() => {})
      return { outcome: 'EXCEPTION_CAPACITY', detail: 'Capacity exhausted; order routed to exception/refund workflow.' }
    }
  }

  // Fulfil: order paid, reservations consumed, tickets issued, ledger posted — atomically.
  await db.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUnique({ where: { id: order.id }, include: { payments: true } })
    if (!freshOrder || freshOrder.status === 'PAID') return // double-guard inside txn
    await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: now } })
    for (const res of await tx.inventoryReservation.findMany({ where: { orderId: order.id, status: 'ACTIVE' } })) {
      await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: 'CONSUMED' } })
      await tx.ticketType.update({ where: { id: res.ticketTypeId }, data: { soldCount: { increment: res.qty }, reservedCount: { decrement: res.qty } } })
    }
    const ttypes = await tx.ticketType.findMany({ where: { id: { in: order.items.map((i) => i.ticketTypeId) } } })
    const map = new Map(ttypes.map((t) => [t.id, t]))
    let seq = 0
    for (const item of order.items) {
      const tt = map.get(item.ticketTypeId)
      for (let i = 0; i < item.qty; i++) {
        seq += 1
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ticketTypeId: item.ticketTypeId,
            orderId: order.id,
            userId: order.userId ?? null,
            holderName: order.buyerName,
            holderEmail: order.buyerEmail,
            code: `${ticketCode()}`,
            qrSecret: `${ticketCode()}-${seq}`,
            status: 'VALID',
            seatInfo: tt ? `${tt.name}` : null,
          },
        })
      }
    }
    if (order.discountCode) {
      await tx.discountCode
        .update({ where: { eventId_code: { eventId: order.eventId, code: order.discountCode } }, data: { usedCount: { increment: 1 } } })
        .catch(() => {})
    }
    await tx.invoice.create({
      data: {
        orgId: order.orgId,
        orderId: order.id,
        number: `RCPT-${order.reference}`,
        description: `Tickets — ${order.event.title}`,
        amountMinor: order.totalMinor,
        currency: order.currency,
        status: 'PAID',
        paidAt: now,
      },
    })
  })

  // Ledger journal — idempotent by key order-payment:{orderId}:{attemptId}.
  await ensureOrgAccounts(order.orgId)
  await ensurePlatformAccounts()
  if (order.totalMinor > 0) {
    await postJournal({
      idempotencyKey: `order-payment:${order.id}:${paymentAttemptId}`,
      orgId: order.orgId,
      refType: 'ORDER_PAYMENT',
      refId: order.id,
      memo: `Ticket sale ${order.reference}`,
      createdBy: 'system:fulfilment',
      lines: [
        { accountCode: 'collections', orgScoped: false, direction: 'DEBIT', amountMinor: order.totalMinor },
        { accountCode: 'platform_fees', orgScoped: false, direction: 'CREDIT', amountMinor: order.platformFeeMinor },
        { accountCode: 'organizer_payable', orgScoped: true, direction: 'CREDIT', amountMinor: order.totalMinor - order.platformFeeMinor },
      ],
    })
  }

  // Notifications + SMS receipt (transactional, deduplicated).
  const eventTitle = order.event.title
  if (order.userId) {
    await notifyUser({
      userId: order.userId,
      type: 'TICKET_ISSUED',
      title: 'Your tickets are ready',
      body: `Payment confirmed for ${eventTitle}. ${order.items.reduce((s, i) => s + i.qty, 0)} ticket(s) issued.`,
      link: `#/order/${order.reference}`,
    }).catch(() => {})
  }
  await queueMessage({
    channel: 'SMS',
    target: order.buyerPhone ?? '',
    userId: order.userId,
    template: 'payment_receipt',
    body: `iEventPlux: Payment received for ${eventTitle.slice(0, 40)}. Ref ${order.reference}. View tickets in My Tickets.`,
    purpose: 'TRANSACTIONAL',
    dedupKey: `receipt:${order.id}:${paymentAttemptId}`,
  }).catch(() => {})

  return { outcome: 'FULFILLED', detail: 'Order paid; tickets issued; ledger posted.' }
}

/** Free RSVP order finalization (no payment, still inventory-controlled). */
export async function fulfilFreeOrder(orderId: string): Promise<{ tickets: number }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, event: true, reservations: true } })
  if (!order) throw errors.notFound('Order not found.')
  if (order.status === 'PAID') return { tickets: 0 }
  if (order.totalMinor !== 0) throw errors.conflict('Order requires payment.')
  const now = new Date()
  const usable = order.reservations.some((r) => r.status === 'ACTIVE' && r.expiresAt > now)
  if (!usable) {
    const canReserve = await db.$transaction(async (tx) => {
      for (const item of order.items) {
        const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } })
        if (!tt) return false
        if (tt.quota > 0 && tt.soldCount + tt.reservedCount + item.qty > tt.quota) return false
      }
      for (const item of order.items) {
        await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reservedCount: { increment: item.qty } } })
        await tx.inventoryReservation.create({
          data: { orderId: order.id, ticketTypeId: item.ticketTypeId, qty: item.qty, status: 'ACTIVE', expiresAt: new Date(now.getTime() + 60_000) },
        })
      }
      return true
    })
    if (!canReserve) throw errors.conflict('This free allocation is now fully booked.')
  }
  await db.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({ where: { id: orderId } })
    if (!fresh || fresh.status === 'PAID') return
    await tx.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: now } })
    for (const res of await tx.inventoryReservation.findMany({ where: { orderId, status: 'ACTIVE' } })) {
      await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: 'CONSUMED' } })
      await tx.ticketType.update({ where: { id: res.ticketTypeId }, data: { soldCount: { increment: res.qty }, reservedCount: { decrement: res.qty } } })
    }
    const items = await tx.orderItem.findMany({ where: { orderId } })
    for (const item of items) {
      const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } })
      for (let i = 0; i < item.qty; i++) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ticketTypeId: item.ticketTypeId,
            orderId: order.id,
            userId: order.userId ?? null,
            holderName: order.buyerName,
            holderEmail: order.buyerEmail,
            code: ticketCode(),
            qrSecret: ticketCode(),
            status: 'VALID',
            seatInfo: tt?.name ?? null,
          },
        })
      }
    }
  })
  if (order.userId) {
    await notifyUser({
      userId: order.userId,
      type: 'TICKET_ISSUED',
      title: 'RSVP confirmed',
      body: `Your free tickets for ${order.event.title} are ready.`,
      link: `#/order/${order.reference}`,
    }).catch(() => {})
  }
  return { tickets: order.items.reduce((s, i) => s + i.qty, 0) }
}

/**
 * Apply a verified provider outcome to a payment attempt + order.
 * Called from callback processing AND reconciliation (both idempotent paths).
 */
export async function applyProviderOutcome(params: {
  attemptId: string
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN'
  amountMinor: number | null
  providerPaymentId?: string | null
  source: 'CALLBACK' | 'AUTHENTICATED_STATUS' | 'RECONCILE'
}): Promise<FulfilOutcome | { outcome: 'NOOP' | 'PENDING' | 'FAILED'; detail: string }> {
  const attempt = await db.paymentAttempt.findUnique({ where: { id: params.attemptId }, include: { order: true } })
  if (!attempt) return { outcome: 'NOOP', detail: 'Attempt not found.' }
  // A public callback is never evidence of real payment. Real attempts must
  // enter via an authenticated provider status read (AUTHENTICATED_STATUS or RECONCILE).
  if (params.source === 'CALLBACK' && attempt.provider !== 'SIMULATOR') {
    return { outcome: 'REJECTED', detail: 'Unverified callback cannot fulfil a real payment.' }
  }
  if (process.env.NODE_ENV === 'production' && attempt.provider === 'SIMULATOR') {
    return { outcome: 'REJECTED', detail: 'Simulator attempts are forbidden in production.' }
  }

  if (params.providerPaymentId) {
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { providerPaymentId: params.providerPaymentId } })
  }

  if (params.outcome === 'SUCCESS') {
    // Amount verification: never trust a mismatched callback/status payload.
    if (!confirmedAmountMatches(params.amountMinor, attempt.amountMinor)) {
      await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'UNKNOWN', failureReason: `Amount mismatch: expected ${attempt.amountMinor}, provider said ${params.amountMinor}` },
      })
      await db.providerEvent.updateMany({ where: { reference: attempt.reference, status: 'RECEIVED' }, data: { status: 'REJECTED' } })
      return { outcome: 'REJECTED', detail: 'Amount mismatch — not marking paid.' }
    }
    if (attempt.status === 'SUCCESS') return { outcome: 'NOOP', detail: 'Already successful.' }
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'SUCCESS', verifiedAt: new Date(), lastStatusAt: new Date(), rawResult: JSON.stringify({ source: params.source }) },
    })
    return fulfilPaidOrder({ orderId: attempt.orderId ?? '', paymentAttemptId: attempt.id, amountMinor: attempt.amountMinor })
  }

  if (params.outcome === 'FAILURE') {
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'FAILED', failureReason: `Provider reported failure (${params.source})`, lastStatusAt: new Date() },
    })
    // Order may be retried with a new attempt; expiry sweep handles the rest.
    return { outcome: 'FAILED', detail: 'Provider reported failure.' }
  }

  // PENDING / UNKNOWN stay unresolved — a timeout alone never charges again or erases payments.
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { lastStatusAt: new Date() } })
  return { outcome: 'PENDING', detail: 'Outcome still unresolved.' }
}

export async function paymentsConfigured(): Promise<boolean> {
  const { resolveSimulatorModes } = await import('../hubtel/credentials')
  return !(await resolveSimulatorModes()).paymentsSimulator
}
