import { db } from '../../lib/db'
import type { Prisma } from '@prisma/client'
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

/** Roll back *all* claims when one tier has exhausted its quota. */
class LatePaymentCapacityUnavailable extends Error {}
class PaidSouvenirUnavailable extends Error {}

/** A verified payment that cannot be fulfilled must not strand stock holds.
 * Called only after the Order row is locked and changed to EXCEPTION_REVIEW,
 * inside the SAME transaction as the refund-case creation. The customer keeps
 * a financial claim, but never gains an admission/collection entitlement. */
async function releaseExceptionInventory(tx: Prisma.TransactionClient, orderId: string) {
  const holds = await tx.inventoryReservation.findMany({ where: { orderId, status: 'ACTIVE' }, orderBy: { ticketTypeId: 'asc' } })
  for (const hold of holds) {
    const updated = await tx.inventoryReservation.updateMany({
      where: { id: hold.id, status: 'ACTIVE' }, data: { status: 'RELEASED', releasedAt: new Date() },
    })
    if (!updated.count) continue
    const stock = await tx.ticketType.updateMany({
      where: { id: hold.ticketTypeId, reservedCount: { gte: hold.qty } },
      data: { reservedCount: { decrement: hold.qty } },
    })
    if (stock.count !== 1) throw errors.conflict('Ticket reserved stock needs reconciliation before refund review.')
  }
  const lines = await tx.souvenirOrderItem.findMany({ where: { orderId, holdStatus: 'ACTIVE' }, orderBy: { productId: 'asc' } })
  for (const line of lines) {
    const updated = await tx.souvenirOrderItem.updateMany({
      where: { id: line.id, holdStatus: 'ACTIVE' }, data: { holdStatus: 'RELEASED' },
    })
    if (!updated.count) continue
    const stock = await tx.eventSouvenirProduct.updateMany({
      where: { id: line.productId, stockReserved: { gte: line.qty } },
      data: { stockReserved: { decrement: line.qty } },
    })
    if (stock.count !== 1) throw errors.conflict('Souvenir reserved stock needs reconciliation before refund review.')
  }
}

export interface FulfilOutcome {
  outcome: 'FULFILLED' | 'ALREADY_PAID' | 'EXCEPTION_CAPACITY' | 'REJECTED'
  detail: string
}

export async function fulfilPaidOrder(params: { orderId: string; paymentAttemptId: string; amountMinor: number }): Promise<FulfilOutcome> {
  const { orderId, paymentAttemptId, amountMinor } = params
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, souvenirItems: true, event: true, reservations: true, payments: true } })
  if (!order) throw errors.notFound('Order not found.')

  // Idempotency: another attempt already paid this order → duplicate payment case.
  const successAttempts = order.payments.filter((p) => p.status === 'SUCCESS' && p.id !== paymentAttemptId)
  // A replay of the SAME verified provider attempt is idempotent, not an
  // additional payment. Only a distinct successful attempt is refund-worthy.
  if (order.status === 'PAID' && successAttempts.length === 0) {
    return { outcome: 'ALREADY_PAID', detail: 'Order was already fulfilled for this payment attempt.' }
  }
  if (successAttempts.length > 0) {
    // Serialize duplicate-payment exception creation for this order. Provider
    // callbacks can replay concurrently; never open multiple refund cases for
    // the same excess payment attempt. This is NOT a provider refund.
    const newlyFlagged = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${order.id}), 71931)`
      const reason = `Duplicate successful payment attempt ${paymentAttemptId} for order ${order.reference}; manual refund review required.`
      const existing = await tx.refundCase.findFirst({
        where: { orderId: order.id, createdByKind: 'SYSTEM', reason }, select: { id: true },
      })
      if (existing) return false
      await tx.refundCase.create({
        data: {
          orderId: order.id,
          requestedBy: null, createdByKind: 'SYSTEM',
          type: 'FULL', amountMinor, status: 'REQUESTED', reason,
        },
      })
      await tx.order.updateMany({
        where: { id: order.id, status: { notIn: ['REFUNDED', 'REFUND_PENDING'] } },
        data: { status: 'EXCEPTION_REVIEW', exceptionReason: 'Duplicate successful payment attempts.' },
      })
      return true
    })
    if (newlyFlagged) await notifyUser({
      userId: order.userId ?? '',
      type: 'PAYMENT_REVIEW',
      title: 'Payment under review',
      body: `We received more than one payment for order ${order.reference}. Our team will resolve the excess immediately — your money is accounted for.`,
      link: `#/order/${order.reference}`,
    }).catch(() => {})
    return { outcome: 'ALREADY_PAID', detail: 'Order already paid; excess payment routed to refund workflow.' }
  }

  if (order.status === 'EXCEPTION_REVIEW') return { outcome: 'REJECTED', detail: 'Order is already in financial exception review.' }
  if (order.status === 'CANCELLED') return { outcome: 'REJECTED', detail: 'Cancelled order payment requires refund review.' }
  if (order.status === 'REFUNDED' || order.status === 'REFUND_PENDING') {
    return { outcome: 'REJECTED', detail: 'Order already refunded; payment routed for resolution.' }
  }

  // Late payment vs reservations: if reservations expired, try to re-reserve capacity.
  const now = new Date()
  const usable = order.reservations.filter((r) => r.status === 'ACTIVE' && r.expiresAt > now)
  if (order.items.length > 0 && usable.length === 0) {
    // Attempt capacity re-reservation (never oversell: quota re-checked transactionally).
    const canReserve = await db.$transaction(async (tx) => {
      // Stable row order prevents deadlocks when different orders include the
      // same tiers in different sequences. Conditional SQL is required:
      // read-then-update can oversell under concurrent late confirmations.
      const sorted = [...order.items].sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId))
      for (const item of sorted) {
        const claimed = await tx.$executeRaw`
          UPDATE "TicketType"
          SET "reservedCount" = "reservedCount" + ${item.qty}
          WHERE "id" = ${item.ticketTypeId}
            AND ("quota" = 0 OR "soldCount" + "reservedCount" + ${item.qty} <= "quota")
        `
        if (claimed !== 1) throw new LatePaymentCapacityUnavailable()
      }
      for (const item of sorted) {
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
    }).catch((error: unknown) => {
      if (error instanceof LatePaymentCapacityUnavailable) return false
      throw error
    })
    if (!canReserve) {
      // Capacity gone: explicit exception + refund workflow. Money stays accounted.
      const escalated = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE
        `
        if (!rows.length || rows[0].status === 'PAID') return false
        if (rows[0].status === 'EXCEPTION_REVIEW') return true
        await tx.refundCase.create({ data: {
          orderId: order.id, requestedBy: null, createdByKind: 'SYSTEM', type: 'FULL',
          amountMinor, status: 'REQUESTED',
          reason: `Late payment after reservation expiry for order ${order.reference}; capacity exhausted.`,
        } })
        await tx.order.update({ where: { id: order.id }, data: {
          status: 'EXCEPTION_REVIEW', exceptionReason: 'Late payment with exhausted capacity; routed to refund.',
        } })
        await releaseExceptionInventory(tx, order.id)
        return true
      })
      if (!escalated) return { outcome: 'ALREADY_PAID', detail: 'Another callback already completed this order.' }
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

  // Fulfil: ticket and souvenir entitlement mutations are in one transaction.
  // QR collection is a separate later staff-authorized operation.
  try {
  await db.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUnique({ where: { id: order.id }, include: { payments: true } })
    if (!freshOrder || freshOrder.status === 'PAID') return // double-guard inside txn
    // The status transition acquires the order row lock before any SKU stock
    // movement. Racing callbacks for the same reference cannot both fulfill.
    const claimedOrder = await tx.order.updateMany({
      where: { id: order.id, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: now },
    })
    if (!claimedOrder.count) return
    // Lock collection line rows before touching stock: the expiry worker also
    // locks these rows first. A just-expired hold can be fulfilled only when
    // physical stock remains. No invoice is issued for an unavailable variant.
    const souvenirLines = await tx.$queryRaw<Array<{id: string;productId: string;qty: number;holdStatus: string}>>`
      SELECT "id", "productId", "qty", "holdStatus" FROM "SouvenirOrderItem"
      WHERE "orderId" = ${order.id} ORDER BY "productId" FOR UPDATE
    `
    for (const line of souvenirLines) {
      if (!['ACTIVE', 'RELEASED'].includes(line.holdStatus)) throw new PaidSouvenirUnavailable()
      const changed = line.holdStatus === 'ACTIVE'
        ? await tx.$executeRaw`
            UPDATE "EventSouvenirProduct"
            SET "stockReserved" = "stockReserved" - ${line.qty}, "stockSold" = "stockSold" + ${line.qty}
            WHERE "id" = ${line.productId} AND "stockReserved" >= ${line.qty}
          `
        : await tx.$executeRaw`
            UPDATE "EventSouvenirProduct"
            SET "stockSold" = "stockSold" + ${line.qty}
            WHERE "id" = ${line.productId}
              AND "stockTotal" >= "stockSold" + "stockReserved" + ${line.qty}
          `
      if (changed !== 1) throw new PaidSouvenirUnavailable()
      await tx.souvenirOrderItem.update({ where: { id: line.id }, data: { holdStatus: 'CONSUMED' } })
    }
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
        description: `${order.items.length ? 'Tickets' : ''}${order.items.length && order.souvenirItems.length ? ' and ' : ''}${order.souvenirItems.length ? 'Souvenirs' : ''} — ${order.event.title}`,
        amountMinor: order.totalMinor,
        currency: order.currency,
        status: 'PAID',
        paidAt: now,
      },
    })
  })
  } catch (reason) {
    if (!(reason instanceof PaidSouvenirUnavailable)) throw reason
    const escalated = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE
      `
      if (!rows.length || rows[0].status === 'PAID') return false
      if (rows[0].status === 'EXCEPTION_REVIEW') return true
      await tx.refundCase.create({ data: {
        orderId: order.id, requestedBy: null, createdByKind: 'SYSTEM', type: 'FULL',
        amountMinor, status: 'REQUESTED',
        reason: `Payment confirmed after souvenir stock was released or exhausted for ${order.reference}. Needs refund or inventory resolution.`,
      } })
      await tx.order.update({ where: { id: order.id }, data: { status: 'EXCEPTION_REVIEW', exceptionReason: 'Paid souvenir unavailable; refund review required.' } })
      await releaseExceptionInventory(tx, order.id)
      return true
    })
    if (!escalated) return { outcome: 'ALREADY_PAID', detail: 'Another callback already completed this order.' }
    if (order.userId) await notifyUser({
      userId: order.userId, type: 'PAYMENT_REVIEW', title: 'Payment under review — souvenir inventory',
      body: `Your payment for ${order.event.title} was received, but a souvenir is no longer available. Our team will resolve the order or refund it.`,
      link: `#/order/${order.reference}`,
    }).catch(() => {})
    return { outcome: 'EXCEPTION_CAPACITY', detail: 'Paid souvenir inventory exhausted; order routed to refund review.' }
  }

  // Ledger journal — idempotent by key order-payment:{orderId}:{attemptId}.
  await ensureOrgAccounts(order.orgId)
  await ensurePlatformAccounts()
  if (order.totalMinor > 0) {
    await postJournal({
      idempotencyKey: `order-payment:${order.id}:${paymentAttemptId}`,
      orgId: order.orgId,
      refType: 'ORDER_PAYMENT',
      refId: order.id,
      memo: `Event ticket/souvenir sale ${order.reference}`,
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
      title: order.souvenirItems.length ? 'Your event receipt is ready' : 'Your tickets are ready',
      body: `Payment confirmed for ${eventTitle}. ${order.items.reduce((s, i) => s + i.qty, 0)} ticket(s) and ${order.souvenirItems.reduce((s, i) => s + i.qty, 0)} souvenir(s). Collection is confirmed separately at the event.`,
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

  return { outcome: 'FULFILLED', detail: 'Verified payment fulfilled; tickets and souvenir receipt recorded; ledger posted.' }
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
