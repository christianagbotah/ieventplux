import { db } from '../../lib/db'
import { errors } from '../api'
import { orderReference } from '../ids'
import { activeFeeVersion, computePlatformFee } from '../fees'
import { getSetting } from '../settings'

/**
 * Order creation with database-enforced inventory reservations.
 *
 * Concurrency: reservation claiming runs inside a transaction that re-reads
 * ticket types with fresh quota checks and bumps reservedCount atomically —
 * competing buyers cannot oversell the last ticket (SQLite serializes writers,
 * and the invariant sold + reserved <= quota is re-checked inside the txn).
 */

export interface CreateOrderInput {
  eventId: string
  userId?: string | null
  buyerName: string
  buyerEmail: string
  buyerPhone?: string | null
  discountCode?: string | null
  items: { ticketTypeId: string; qty: number }[]
}

export interface CreateOrderResult {
  orderReference: string
  status: string
  totalMinor: number
  kind: 'PAID' | 'FREE'
  expiresAt: Date
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!input.items?.length) throw errors.badRequest('Select at least one ticket type.')
  if (input.items.length > 6) throw errors.badRequest('Too many line items.')

  const event = await db.event.findUnique({ where: { id: input.eventId }, include: { ticketTypes: { where: { active: true } } } })
  if (!event) throw errors.notFound('Event not found.')
  if (!['PUBLISHED', 'LIVE', 'POSTPONED'].includes(event.status)) throw errors.conflict('This event is not open for bookings.')
  if (event.deletedAt) throw errors.notFound('Event not found.')

  const now = new Date()
  const fee = await activeFeeVersion()
  const reservationMinutes = await getSetting('reservationMinutes')

  // Pre-validate items
  let subtotal = 0
  const validated: { ticketTypeId: string; qty: number; unitPriceMinor: number; lineTotalMinor: number; discountMinor: number }[] = []
  for (const item of input.items) {
    const qty = Math.floor(Number(item.qty))
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw errors.badRequest('Quantity must be between 1 and 10 per ticket type.')
    const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)
    if (!tt) throw errors.badRequest('Invalid ticket type.')
    if (tt.saleStartsAt && tt.saleStartsAt > now) throw errors.conflict(`Sales for ${tt.name} have not opened yet.`)
    if (tt.saleEndsAt && tt.saleEndsAt < now) throw errors.conflict(`Sales for ${tt.name} have closed.`)
    if (input.userId && tt.perBuyerLimit > 0) {
      const bought = await db.orderItem.aggregate({
        where: { ticketTypeId: tt.id, order: { userId: input.userId, status: { in: ['PAID', 'PENDING_PAYMENT'] } } },
        _sum: { qty: true },
      })
      const prior = bought._sum.qty ?? 0
      if (prior + qty > tt.perBuyerLimit) throw errors.conflict(`Per-buyer limit reached for ${tt.name} (max ${tt.perBuyerLimit}).`)
    }
    const unit = tt.priceMinor
    let lineTotal = unit * qty
    let discount = 0
    if (tt.groupMinQty && tt.groupPctOff && qty >= tt.groupMinQty) {
      discount = Math.round((lineTotal * tt.groupPctOff) / 100)
      lineTotal -= discount
    }
    subtotal += lineTotal
    validated.push({ ticketTypeId: tt.id, qty, unitPriceMinor: unit, lineTotalMinor: lineTotal, discountMinor: discount })
  }

  // Discount code (single code per order)
  let orderDiscount = 0
  let appliedCode: string | null = null
  if (input.discountCode) {
    const dc = await db.discountCode.findUnique({ where: { eventId_code: { eventId: event.id, code: input.discountCode.toUpperCase() } } })
    if (dc && dc.active && (!dc.expiresAt || dc.expiresAt > now) && dc.usedCount < dc.maxUses && subtotal > 0) {
      if (dc.pctOff) orderDiscount = Math.round((subtotal * dc.pctOff) / 100)
      else if (dc.amountOffMinor) orderDiscount = Math.min(dc.amountOffMinor, subtotal)
      appliedCode = dc.code
    } else {
      throw errors.badRequest('This discount code is not valid.')
    }
  }

  const total = Math.max(0, subtotal - orderDiscount)
  const platformFee = total > 0 ? computePlatformFee(total, fee) : 0
  const kind: 'PAID' | 'FREE' = total > 0 ? 'PAID' : 'FREE'
  const reference = orderReference()
  const expiresAt = new Date(now.getTime() + reservationMinutes * 60 * 1000)

  const order = await db.$transaction(async (tx) => {
    // Re-check capacity and claim reservations atomically.
    for (const item of validated) {
      const updated = await tx.ticketType.updateMany({
        where: { id: item.ticketTypeId, OR: [{ quota: 0 }, { quota: { gte: 0 } }] },
        data: {},
      })
      void updated
      const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } })
      if (!tt) throw errors.badRequest('Ticket type vanished during checkout.')
      if (tt.quota > 0 && tt.soldCount + tt.reservedCount + item.qty > tt.quota) {
        throw errors.conflict(`Not enough tickets left for ${tt.name}.`)
      }
      await tx.ticketType.update({ where: { id: tt.id }, data: { reservedCount: { increment: item.qty } } })
    }
    const created = await tx.order.create({
      data: {
        reference,
        orgId: event.orgId,
        eventId: event.id,
        userId: input.userId ?? null,
        buyerName: input.buyerName.slice(0, 120),
        buyerEmail: input.buyerEmail.slice(0, 160).toLowerCase(),
        buyerPhone: input.buyerPhone?.slice(0, 24) ?? null,
        kind,
        status: kind === 'FREE' ? 'DRAFT' : 'PENDING_PAYMENT',
        currency: 'GHS',
        subtotalMinor: subtotal,
        discountMinor: orderDiscount + validated.reduce((s, v) => s + v.discountMinor, 0),
        platformFeeMinor: platformFee,
        totalMinor: total,
        feeVersionId: fee.feeVersionId,
        feeSnapshot: JSON.stringify(fee),
        discountCode: appliedCode,
        expiresAt,
      },
    })
    for (const item of validated) {
      await tx.orderItem.create({
        data: {
          orderId: created.id,
          ticketTypeId: item.ticketTypeId,
          qty: item.qty,
          unitPriceMinor: item.unitPriceMinor,
          discountMinor: item.discountMinor,
          lineTotalMinor: item.lineTotalMinor,
        },
      })
      await tx.inventoryReservation.create({
        data: { orderId: created.id, ticketTypeId: item.ticketTypeId, qty: item.qty, status: 'ACTIVE', expiresAt },
      })
    }
    return created
  })

  return { orderReference: order.reference, status: order.status, totalMinor: order.totalMinor, kind, expiresAt }
}

/** Release expired reservations and expire stale orders (worker sweep). */
export async function releaseExpiredReservations(): Promise<{ released: number; ordersExpired: number }> {
  const now = new Date()
  const expired = await db.inventoryReservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } }, include: { order: true } })
  let released = 0
  const orderIds = new Set<string>()
  for (const res of expired) {
    await db.$transaction(async (tx) => {
      const fresh = await tx.inventoryReservation.findUnique({ where: { id: res.id } })
      if (!fresh || fresh.status !== 'ACTIVE' || fresh.expiresAt > new Date()) return
      await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: 'EXPIRED', releasedAt: now } })
      await tx.ticketType.update({ where: { id: res.ticketTypeId }, data: { reservedCount: { decrement: fresh.qty } } })
      orderIds.add(res.orderId)
      released += 1
    })
  }
  let ordersExpired = 0
  for (const orderId of orderIds) {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { reservations: true, payments: true } })
    if (!order) continue
    if (['DRAFT', 'PENDING_PAYMENT'].includes(order.status) && order.expiresAt && order.expiresAt < now) {
      const hasSuccess = order.payments.some((p) => p.status === 'SUCCESS')
      if (!hasSuccess) {
        await db.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' } })
        ordersExpired += 1
      }
    }
  }
  return { released, ordersExpired }
}
