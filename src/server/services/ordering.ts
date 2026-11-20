import { db } from '../../lib/db'
import { errors } from '../api'
import { orderReference } from '../ids'
import { activeFeeVersion, computePlatformFee } from '../fees'
import { getSetting } from '../settings'
import { checkoutLinePrice, normalizeCheckoutLines } from '../checkout-policy'
import { normalizeSouvenirLines, souvenirCheckoutEnabled } from '../souvenir-policy'

/**
 * Order creation with database-enforced inventory reservations.
 *
 * Concurrency: PostgreSQL conditional UPDATE atomically checks sellability,
 * price snapshot, sale window and sold+reserved+requested <= quota. An advisory
 * transaction lock serializes concurrent checkouts for the same user/event so
 * per-buyer limits cannot be bypassed by overlapping requests.
 */

export interface CreateOrderInput {
  eventId: string
  userId?: string | null
  buyerName: string
  buyerEmail: string
  buyerPhone?: string | null
  discountCode?: string | null
  items: { ticketTypeId: string; qty: number }[]
  souvenirs?: { productId: string; qty: number }[]
}

export interface CreateOrderResult {
  orderReference: string
  status: string
  totalMinor: number
  kind: 'PAID' | 'FREE'
  expiresAt: Date
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const souvenirSelections = normalizeSouvenirLines(input.souvenirs ?? [])
  if (souvenirSelections.length && !souvenirCheckoutEnabled()) throw errors.unavailable('SOUVENIR_CHECKOUT_DISABLED', 'Online souvenir ordering is not yet open for this event.')
  const lines = input.items.length ? normalizeCheckoutLines(input.items) : []
  if (!lines.length && !souvenirSelections.length) throw errors.badRequest('Choose at least one ticket or souvenir.')

  const event = await db.event.findUnique({ where: { id: input.eventId }, include: { ticketTypes: { where: { active: true } }, souvenirs: { where: { active: true } }, org: { select: { status: true, deletedAt: true } } } })
  if (!event) throw errors.notFound('Event not found.')
  if (!['PUBLISHED', 'LIVE', 'POSTPONED'].includes(event.status)) throw errors.conflict('This event is not open for bookings.')
  if (event.deletedAt) throw errors.notFound('Event not found.')

  const now = new Date()
  const fee = await activeFeeVersion()
  const reservationMinutes = await getSetting('reservationMinutes')

  // Pre-validate items
  let subtotal = 0
  const validated: { ticketTypeId: string; qty: number; unitPriceMinor: number; lineTotalMinor: number; discountMinor: number; groupMinQty: number | null; groupPctOff: number | null }[] = []
  for (const item of lines) {
    const qty = item.qty
    const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)
    if (!tt) throw errors.badRequest('Invalid ticket type.')
    if (tt.saleStartsAt && tt.saleStartsAt > now) throw errors.conflict(`Sales for ${tt.name} have not opened yet.`)
    if (tt.saleEndsAt && tt.saleEndsAt < now) throw errors.conflict(`Sales for ${tt.name} have closed.`)
    // Re-check lifetime and reserved-order buyer caps inside the transaction,
    // under a per-event/user database lock, rather than in this stale pre-read.
    if (qty > tt.perBuyerLimit) throw errors.conflict(`Maximum ${tt.perBuyerLimit} tickets per buyer for ${tt.name}.`)
    const unit = tt.priceMinor
    const { lineTotalMinor, discountMinor } = checkoutLinePrice(unit, qty, tt.groupMinQty, tt.groupPctOff)
    subtotal += lineTotalMinor
    if (subtotal > 2_000_000_000) throw errors.badRequest('Order total is too large. Reduce ticket quantities.')
    validated.push({ ticketTypeId: tt.id, qty, unitPriceMinor: unit, lineTotalMinor, discountMinor, groupMinQty: tt.groupMinQty, groupPctOff: tt.groupPctOff })
  }

  const ticketSubtotal = subtotal
  const merchLines: { productId: string; qty: number; unitPriceMinor: number; lineTotalMinor: number }[] = []
  if (souvenirSelections.length && (event.org.deletedAt || event.org.status !== 'ACTIVE')) {
    throw errors.forbidden('Souvenir sales require an approved, active organizer.')
  }
  for (const selection of souvenirSelections) {
    const product = event.souvenirs.find((row) => row.id === selection.productId)
    if (!product || product.currency !== 'GHS') throw errors.badRequest('This souvenir is unavailable for checkout.')
    if (product.priceMinor <= 0) throw errors.conflict('This souvenir is not configured for paid sales.')
    const lineTotalMinor = product.priceMinor * selection.qty
    if (!Number.isSafeInteger(lineTotalMinor) || subtotal + lineTotalMinor > 2_000_000_000) throw errors.badRequest('Order total exceeds the maximum.')
    subtotal += lineTotalMinor
    merchLines.push({ productId: product.id, qty: selection.qty, unitPriceMinor: product.priceMinor, lineTotalMinor })
  }

  // Promotional codes are defined for ticket sales and must not discount physical stock.
  // Discount code (single code per order)
  let orderDiscount = 0
  let appliedCode: string | null = null
  if (input.discountCode) {
    const dc = await db.discountCode.findUnique({ where: { eventId_code: { eventId: event.id, code: input.discountCode.toUpperCase() } } })
    if (dc && dc.active && (!dc.expiresAt || dc.expiresAt > now) && dc.usedCount < dc.maxUses && ticketSubtotal > 0) {
      if (dc.pctOff) orderDiscount = Math.round((ticketSubtotal * dc.pctOff) / 100)
      else if (dc.amountOffMinor) orderDiscount = Math.min(dc.amountOffMinor, ticketSubtotal)
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

  // Consistent ticket-type lock ordering avoids PostgreSQL deadlocks when
  // multiple buyers select the same tiers in a different visual order.
  validated.sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId))
  merchLines.sort((a, b) => a.productId.localeCompare(b.productId))

  const order = await db.$transaction(async (tx) => {
    // Lock identity to prevent two checkouts for the same buyer from both
    // reading the old per-buyer total and reserving past the configured cap.
    if (input.userId) {
      // Return a numeric value; Prisma cannot deserialize PostgreSQL void.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${event.id}), hashtext(${input.userId}))`
    }
    const currentEvent = await tx.event.findUnique({ where: { id: event.id }, select: { status: true, deletedAt: true } })
    if (!currentEvent || currentEvent.deletedAt || !['PUBLISHED', 'LIVE', 'POSTPONED'].includes(currentEvent.status)) {
      throw errors.conflict('This event is no longer accepting bookings.')
    }
    // The organizer may have been suspended after the initial catalogue read.
    // Revalidate its approval inside the reservation transaction before
    // claiming any physical stock; the outer read is only a preview.
    if (merchLines.length) {
      const organizer = await tx.organization.findUnique({
        where: { id: event.orgId }, select: { status: true, deletedAt: true },
      })
      if (!organizer || organizer.deletedAt || organizer.status !== 'ACTIVE') {
        throw errors.forbidden('Souvenir sales require an approved, active organizer.')
      }
    }
    const claimAt = new Date()
    for (const item of validated) {
      const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } })
      if (!tt || tt.eventId !== event.id || !tt.active) throw errors.conflict('A ticket type is no longer available. Refresh your selection.')
      if (input.userId) {
        const prior = await tx.orderItem.aggregate({
          where: {
            ticketTypeId: item.ticketTypeId,
            order: { userId: input.userId, eventId: event.id, OR: [
              { status: 'PAID' },
              { status: 'PENDING_PAYMENT', expiresAt: { gt: claimAt } },
              { status: 'DRAFT', expiresAt: { gt: claimAt } },
              { status: 'EXCEPTION_REVIEW' },
            ] },
          },
          _sum: { qty: true },
        })
        if ((prior._sum.qty ?? 0) + item.qty > tt.perBuyerLimit) {
          throw errors.conflict(`Per-buyer limit reached for ${tt.name} (maximum ${tt.perBuyerLimit}, including active reservations).`)
        }
      }
      // One atomic SQL statement protects the final seat against competing
      // checkouts AND organizer quota edits. Row locking is handled by PG.
      // Price and group-policy comparisons ensure no stale quote is charged.
      const claimed = await tx.$executeRaw`
        UPDATE "TicketType"
        SET "reservedCount" = "reservedCount" + ${item.qty}
        WHERE "id" = ${item.ticketTypeId}
          AND "eventId" = ${event.id}
          AND "active" = TRUE
          AND "priceMinor" = ${item.unitPriceMinor}
          AND "groupMinQty" IS NOT DISTINCT FROM ${item.groupMinQty}::integer
          AND "groupPctOff" IS NOT DISTINCT FROM ${item.groupPctOff}::integer
          AND "perBuyerLimit" >= ${item.qty}
          AND ("saleStartsAt" IS NULL OR "saleStartsAt" <= NOW())
          AND ("saleEndsAt" IS NULL OR "saleEndsAt" > NOW())
          AND ("quota" = 0 OR "soldCount" + "reservedCount" + ${item.qty} <= "quota")
      `
      if (claimed !== 1) throw errors.conflict(`Ticket availability or pricing changed for ${tt.name}. Refresh the page and try again.`)
    }
    for (const merch of merchLines) {
      const reserved = await tx.$executeRaw`
        UPDATE "EventSouvenirProduct" SET "stockReserved" = "stockReserved" + ${merch.qty}
        WHERE "id" = ${merch.productId} AND "eventId" = ${event.id}
          AND "active" = TRUE AND "priceMinor" = ${merch.unitPriceMinor}
          AND "stockTotal" >= "stockSold" + "stockReserved" + ${merch.qty}
      `
      if (reserved !== 1) throw errors.conflict('Souvenir availability or pricing has changed. Refresh before ordering.')
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
    for (const merch of merchLines) {
      await tx.souvenirOrderItem.create({ data: { orderId: created.id, productId: merch.productId,
        qty: merch.qty, unitPriceMinor: merch.unitPriceMinor, lineTotalMinor: merch.lineTotalMinor, holdStatus: 'ACTIVE' } })
    }
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
  const expired = await db.inventoryReservation.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    include: { order: true },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: 500,
  })
  let released = 0
  const orderIds = new Set<string>()
  for (const res of expired) {
    const didRelease = await db.$transaction(async (tx) => {
      const fresh = await tx.inventoryReservation.findUnique({ where: { id: res.id },
        include: { order: { select: { status: true, payments: { select: { status: true } } } } },
      })
      if (!fresh || fresh.status !== 'ACTIVE' || fresh.expiresAt > new Date()) return
      if (!['DRAFT', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'].includes(fresh.order.status) ||
          fresh.order.payments.some((attempt) => attempt.status === 'SUCCESS')) return
      const changed = await tx.inventoryReservation.updateMany({
        where: { id: res.id, status: 'ACTIVE', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED', releasedAt: now },
      })
      if (!changed.count) return
      // Keep ticket reservations consistent with merchandise holds: never
      // release a reservation if its counter has already drifted below zero.
      // A failed conditional update rolls back the reservation status change.
      const ticketStock = await tx.ticketType.updateMany({
        where: { id: res.ticketTypeId, reservedCount: { gte: fresh.qty } },
        data: { reservedCount: { decrement: fresh.qty } },
      })
      if (ticketStock.count !== 1) throw errors.conflict('Ticket reserved stock needs reconciliation before expiry release.')
      return true
    })
    // Only count committed transactions; callback success precedes COMMIT.
    if (didRelease) { orderIds.add(res.orderId); released += 1 }
  }
  // A merchandise-only checkout has no ticket InventoryReservation. Release
  // overdue stock via line-level holds; never expire a confirmed or disputed
  // payment. Conditional row updates keep expiry and fulfilment idempotent.
  const expiredSouvenirs = await db.souvenirOrderItem.findMany({
    where: { holdStatus: 'ACTIVE', order: { expiresAt: { lt: now }, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'] } } },
    select: { id: true, orderId: true }, orderBy: [{ order: { expiresAt: 'asc' } }, { id: 'asc' }], take: 500,
  })
  for (const line of expiredSouvenirs) {
    const didRelease = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: line.orderId }, include: { payments: { select: { status: true } } } })
      if (!order || !order.expiresAt || order.expiresAt > new Date() || !['DRAFT', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'].includes(order.status) || order.payments.some((payment) => payment.status === 'SUCCESS')) return
      const updated = await tx.souvenirOrderItem.updateMany({ where: { id: line.id, holdStatus: 'ACTIVE' }, data: { holdStatus: 'RELEASED' } })
      if (!updated.count) return
      const item = await tx.souvenirOrderItem.findUniqueOrThrow({ where: { id: line.id } })
      // A corrupt or concurrently reconciled counter must never become negative.
      // Throwing also rolls back the hold release in this same transaction so
      // operations can investigate without losing the reservation evidence.
      const stock = await tx.eventSouvenirProduct.updateMany({
        where: { id: item.productId, stockReserved: { gte: item.qty } },
        data: { stockReserved: { decrement: item.qty } },
      })
      if (stock.count !== 1) throw errors.conflict('Souvenir reserved stock needs reconciliation before expiry release.')
      return true
    })
    if (didRelease) { orderIds.add(line.orderId); released += 1 }
  }
  let ordersExpired = 0
  for (const orderId of orderIds) {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { reservations: true, payments: true } })
    if (!order) continue
    if (['DRAFT', 'PENDING_PAYMENT'].includes(order.status) && order.expiresAt && order.expiresAt < now) {
      const hasSuccess = order.payments.some((p) => p.status === 'SUCCESS')
      if (!hasSuccess) {
        // Never overwrite a concurrent successful payment/fulfilment. The
        // sweep's earlier read can be stale after a provider callback.
        const transition = await db.order.updateMany({
          where: { id: order.id, status: { in: ['DRAFT', 'PENDING_PAYMENT'] }, expiresAt: { lt: new Date() },
            payments: { none: { status: 'SUCCESS' } } },
          data: { status: 'EXPIRED' },
        })
        ordersExpired += transition.count
      }
    }
  }
  return { released, ordersExpired }
}
