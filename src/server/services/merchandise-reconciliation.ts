import { db } from '@/lib/db'
import { errors } from '@/server/api'
import { formatMoney } from '@/server/money'

/** Order financial information is deliberately nullable for event managers.
 * Only staff with org:view_finance get paid order values. Pickups represent
 * actually completed handovers; pending/refund-review orders are not counted as
 * collectible entitlements even if payment was attempted. */
export async function merchandiseReconciliation(orgId: string, requestedEventId: string | null, canViewMoney: boolean) {
  const events = await db.event.findMany({
    where: { orgId, deletedAt: null, souvenirs: { some: {} } },
    orderBy: { startsAt: 'desc' }, take: 60,
    select: { id: true, title: true, startsAt: true, status: true },
  })
  let event = requestedEventId
    ? await db.event.findFirst({ where: { id: requestedEventId, orgId, deletedAt: null }, select: { id: true, title: true, startsAt: true, status: true } })
    : events[0] ?? null
  if (requestedEventId && !event) throw errors.notFound('Event not found in this organization.')
  if (!event) return {
    eventId: null, events, event: null,
    totals: { paidOrders: 0, paidQty: 0, collectedQty: 0, outstandingQty: 0, reservedQty: 0, stockQty: 0, salesMinor: canViewMoney ? 0 : null },
    items: [], recentCollections: [], shownProducts: 0, totalProducts: 0,
  }
  if (!events.some((item) => item.id === event.id)) events.unshift(event)
  const [products, totalProducts, stock, aggregates, paidOrders, collections] = await Promise.all([
    db.eventSouvenirProduct.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 250,
      select: { id: true, name: true, sku: true, variantLabel: true, active: true, stockTotal: true, stockReserved: true, stockSold: true, stockFulfilled: true } }),
    db.eventSouvenirProduct.count({ where: { eventId: event.id } }),
    db.eventSouvenirProduct.aggregate({ where: { eventId: event.id }, _sum: { stockTotal: true, stockReserved: true } }),
    db.souvenirOrderItem.groupBy({
      by: ['productId'],
      where: { product: { eventId: event.id }, holdStatus: 'CONSUMED', order: { orgId, eventId: event.id, status: 'PAID' } },
      _sum: { qty: true, collectedQty: true, lineTotalMinor: true },
    }),
    db.order.count({ where: { orgId, eventId: event.id, status: 'PAID', souvenirItems: { some: { holdStatus: 'CONSUMED' } } } }),
    db.souvenirCollection.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'desc' }, take: 35,
      select: { id: true, qty: true, createdAt: true,
        collector: { select: { displayName: true } },
        orderItem: { select: { order: { select: { reference: true, buyerName: true, status: true } },
          product: { select: { name: true, variantLabel: true, sku: true } } } },
      } }),
  ])
  const byProduct = new Map(aggregates.map((item) => [item.productId, item._sum]))
  const items = products.map((item) => {
    const counts = byProduct.get(item.id)
    const paidQty = counts?.qty ?? 0
    const collectedQty = counts?.collectedQty ?? 0
    return { ...item, paidQty, collectedQty, outstandingQty: Math.max(0, paidQty - collectedQty),
      availableQty: Math.max(0, item.stockTotal - item.stockReserved - item.stockSold),
      salesMinor: canViewMoney ? (counts?.lineTotalMinor ?? 0) : null }
  })
  const paidQty = aggregates.reduce((sum, item) => sum + (item._sum.qty ?? 0), 0)
  const collectedQty = aggregates.reduce((sum, item) => sum + (item._sum.collectedQty ?? 0), 0)
  const salesMinor = canViewMoney ? aggregates.reduce((sum, item) => sum + (item._sum.lineTotalMinor ?? 0), 0) : null
  return {
    eventId: event.id, event, events, items, totalProducts,
    shownProducts: items.length,
    totals: { paidOrders, paidQty, collectedQty, outstandingQty: Math.max(0, paidQty - collectedQty),
      reservedQty: stock._sum.stockReserved ?? 0, stockQty: stock._sum.stockTotal ?? 0, salesMinor },
    recentCollections: collections.map((record) => ({
      id: record.id, qty: record.qty, createdAt: record.createdAt,
      collector: record.collector.displayName,
      reference: record.orderItem.order.reference,
      buyerName: record.orderItem.order.buyerName,
      orderStatus: record.orderItem.order.status,
      product: record.orderItem.product.name,
      variant: record.orderItem.product.variantLabel,
      sku: record.orderItem.product.sku,
    })),
  }
}

/** Escapes both CSV delimiters and spreadsheet formula-leading text, including
 * cases where whitespace tries to conceal the formula prefix. */
export function safeCsvCell(value: unknown): string {
  const raw = String(value ?? '').replace(/[\r\n\t]/g, ' ').replace(/\0/g, '')
  const sanitized = /^[\s\u00ad\u034f\u061c\u115f\u1160\u17b4-\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]*[=+@-]/.test(raw) ? `'${raw}` : raw
  return `"${sanitized.replace(/"/g, '""')}"`
}

export function merchandiseReportCsv(result: Awaited<ReturnType<typeof merchandiseReconciliation>>): string {
  const moneyAllowed = result.totals.salesMinor !== null
  const headers = ['Event', 'SKU', 'Product', 'Variant', 'Active', 'Total stock', 'Reserved', 'Sold counter', 'Collected counter', 'Available', 'Paid units', 'Handed over', 'Still to collect', ...(moneyAllowed ? ['Paid merchandise sales'] : [])]
  const lines = result.items.map((item) => [
    result.event?.title ?? '', item.sku, item.name, item.variantLabel ?? '', item.active ? 'Yes' : 'No',
    item.stockTotal, item.stockReserved, item.stockSold, item.stockFulfilled, item.availableQty,
    item.paidQty, item.collectedQty, item.outstandingQty,
    ...(moneyAllowed ? [formatMoney(item.salesMinor ?? 0)] : []),
  ])
  return '\uFEFF' + [headers, ...lines].map((row) => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n'
}
