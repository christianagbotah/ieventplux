/**
 * Synthetic merchandise integration QA. REFUSES any database URL other than
 * the explicitly named isolated test schema. No payment gateway calls, real
 * customer data, SMS recipient or actual funds are involved.
 *
 * Usage: set DATABASE_URL with ?schema=ieventplux_merch_qa_20261119 and
 * IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED=1, then bun scripts/merchandise-isolated-qa.ts
 */
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { createOrder, releaseExpiredReservations } from '../src/server/services/ordering'
import { fulfilPaidOrder, fulfilFreeOrder } from '../src/server/services/fulfilment'
import { collectSouvenirItem } from '../src/server/services/souvenir-collection'

const url = new URL(process.env.DATABASE_URL ?? '')
assert.equal(url.searchParams.get('schema'), 'ieventplux_merch_qa_20261119', 'Refusing to run outside isolated QA schema.')
assert.equal(process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED, '1', 'Use the isolated QA feature flag.')
const tag = Date.now().toString(36)
const ownerEmail = `qa-owner-${tag}@example.invalid`
const buyerEmail = `qa-buyer-${tag}@example.invalid`
const qty = (id: string, amount: number) => [{ productId: id, qty: amount }]

async function main() {
  const owner = await db.user.create({ data: { email: ownerEmail, passwordHash: 'TEST-NOT-LOGINABLE', displayName: 'Synthetic QA Owner' } })
  const org = await db.organization.create({ data: { name: 'Isolated Merchandise QA', slug: `merch-qa-${tag}`, ownerId: owner.id, status: 'ACTIVE', verifiedAt: new Date() } })
  const now = Date.now()
  const event = await db.event.create({ data: {
    orgId: org.id, title: 'Synthetic Merch QA Event', slug: `merch-qa-event-${tag}`,
    categorySlug: 'workshop', description: 'Synthetic merchandise stock and settlement QA only.',
    status: 'PUBLISHED', visibility: 'PUBLIC', startsAt: new Date(now + 24 * 3600_000), endsAt: new Date(now + 27 * 3600_000),
  } })
  const shirt = await db.eventSouvenirProduct.create({ data: { eventId: event.id, name: 'Synthetic Black Shirt', sku: `QA-BLACK-${tag}`, priceMinor: 4500, stockTotal: 2 } })
  const buyer = { eventId: event.id, buyerName: 'Synthetic QA Buyer', buyerEmail, items: [] }

  const pending = await createOrder({ ...buyer, souvenirs: qty(shirt.id, 2) })
  assert.equal(pending.totalMinor, 9000)
  assert.equal(pending.kind, 'PAID')
  let item = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: shirt.id } })
  assert.equal(item.stockReserved, 2)
  assert.equal(item.stockSold, 0)
  console.log('PASS: merchandise-only order reserves two items at the correct integer-pesewa price')

  await assert.rejects(() => createOrder({ ...buyer, souvenirs: qty(shirt.id, 1) }))
  item = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: shirt.id } })
  assert.equal(item.stockReserved, 2)
  console.log('PASS: atomic last-in-stock check prevents overselling and preserves original reservation')

  // Two separate checkout requests race for the same last available SKU.
  // Exactly one can reserve it, and the losing request must leave no hold.
  const raceProduct = await db.eventSouvenirProduct.create({ data: {
    eventId: event.id, name: 'Synthetic Race Shirt', sku: `QA-RACE-${tag}`, priceMinor: 1200, stockTotal: 1,
  } })
  const raceResults = await Promise.allSettled([
    createOrder({ ...buyer, buyerEmail: `race-a-${tag}@example.invalid`, souvenirs: qty(raceProduct.id, 1) }),
    createOrder({ ...buyer, buyerEmail: `race-b-${tag}@example.invalid`, souvenirs: qty(raceProduct.id, 1) }),
  ])
  assert.equal(raceResults.filter((result) => result.status === 'fulfilled').length, 1,
    'Only one competing checkout may reserve the final SKU')
  assert.equal(raceResults.filter((result) => result.status === 'rejected').length, 1)
  const raceStock = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: raceProduct.id } })
  assert.equal(raceStock.stockReserved, 1)
  assert.equal(raceStock.stockSold, 0)
  assert.equal(await db.souvenirOrderItem.count({ where: { productId: raceProduct.id, holdStatus: 'ACTIVE' } }), 1)
  console.log('PASS: concurrent last-SKU checkout permits exactly one stock hold')

  const order = await db.order.findUniqueOrThrow({ where: { reference: pending.orderReference } })
  const attempt = await db.paymentAttempt.create({ data: {
    orderId: order.id, reference: `QA-${tag.toUpperCase()}-A1`, provider: 'SIMULATOR',
    status: 'SUCCESS', amountMinor: pending.totalMinor, currency: 'GHS',
  } })
  const fulfilled = await fulfilPaidOrder({ orderId: order.id, paymentAttemptId: attempt.id, amountMinor: pending.totalMinor })
  assert.equal(fulfilled.outcome, 'FULFILLED')
  const line = await db.souvenirOrderItem.findFirstOrThrow({ where: { orderId: order.id } })
  assert.equal(line.holdStatus, 'CONSUMED')
  item = await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: shirt.id } })
  assert.equal(item.stockReserved, 0)
  assert.equal(item.stockSold, 2)
  assert.equal(await db.invoice.count({ where: { orderId: order.id, status: 'PAID' } }), 1)
  console.log('PASS: simulated verified payment consumes stock, creates one paid receipt and no admission ticket')

  // Concurrent provider replay must not create duplicate paid entitlements.
  const parallelReplays = await Promise.all([
    fulfilPaidOrder({ orderId: order.id, paymentAttemptId: attempt.id, amountMinor: pending.totalMinor }),
    fulfilPaidOrder({ orderId: order.id, paymentAttemptId: attempt.id, amountMinor: pending.totalMinor }),
  ])
  assert.deepEqual(parallelReplays.map((result) => result.outcome), ['ALREADY_PAID', 'ALREADY_PAID'])
  assert.equal(await db.invoice.count({ where: { orderId: order.id } }), 1)
  assert.equal(await db.souvenirOrderItem.count({ where: { orderId: order.id, holdStatus: 'CONSUMED' } }), 1)
  assert.equal(await db.ticket.count({ where: { orderId: order.id } }), 0)
  console.log('PASS: simultaneous provider callback replays cannot duplicate merchandise entitlements or receipts')

  const replay = await fulfilPaidOrder({ orderId: order.id, paymentAttemptId: attempt.id, amountMinor: pending.totalMinor })
  assert.equal(replay.outcome, 'ALREADY_PAID')
  assert.equal(await db.invoice.count({ where: { orderId: order.id } }), 1)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: shirt.id } })).stockSold, 2)
  console.log('PASS: replay does not duplicate the invoice or consume stock again')

  const handover = { orderId: order.id, eventId: event.id, orderItemId: line.id, collectorId: owner.id, qty: 1, clientActionId: randomUUID() }
  const firstCollection = await collectSouvenirItem(handover)
  assert.equal(firstCollection.status, 'COLLECTED')
  const replayCollection = await collectSouvenirItem(handover)
  assert.equal(replayCollection.status, 'ALREADY_RECORDED')
  assert.equal((await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: line.id } })).collectedQty, 1)
  const lastCollection = await collectSouvenirItem({ ...handover, clientActionId: randomUUID() })
  assert.equal(lastCollection.status, 'COLLECTED')
  await assert.rejects(() => collectSouvenirItem({ ...handover, clientActionId: randomUUID() }))
  assert.equal((await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: line.id } })).collectedQty, 2)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: shirt.id } })).stockFulfilled, 2)
  assert.equal(await db.souvenirCollection.count({ where: { orderItemId: line.id } }), 2)
  console.log('PASS: partial collection, idempotent retries, correct fulfilled counts and overcollection rejection')

  // Two distinct staff actions race to collect the final unit. Only one may
  // commit; a losing action must not create an audit collection or overcount.
  const collectionRaceProduct = await db.eventSouvenirProduct.create({ data: {
    eventId: event.id, name: 'Synthetic Pickup Race Shirt', sku: `QA-PICKUP-${tag}`, priceMinor: 1800, stockTotal: 1,
  } })
  const collectionRacePending = await createOrder({ ...buyer, buyerEmail: `pickup-${tag}@example.invalid`,
    souvenirs: qty(collectionRaceProduct.id, 1),
  })
  const collectionRaceOrder = await db.order.findUniqueOrThrow({ where: { reference: collectionRacePending.orderReference } })
  const collectionRacePayment = await db.paymentAttempt.create({ data: {
    orderId: collectionRaceOrder.id, reference: `QA-PICKUP-${tag.toUpperCase()}`,
    provider: 'SIMULATOR', status: 'SUCCESS', amountMinor: collectionRacePending.totalMinor,
  } })
  assert.equal((await fulfilPaidOrder({ orderId: collectionRaceOrder.id,
    paymentAttemptId: collectionRacePayment.id, amountMinor: collectionRacePending.totalMinor })).outcome, 'FULFILLED')
  const collectionRaceLine = await db.souvenirOrderItem.findFirstOrThrow({ where: { orderId: collectionRaceOrder.id } })
  const collectionRaceResults = await Promise.allSettled([
    collectSouvenirItem({ orderId: collectionRaceOrder.id, eventId: event.id,
      orderItemId: collectionRaceLine.id, collectorId: owner.id, qty: 1, clientActionId: randomUUID() }),
    collectSouvenirItem({ orderId: collectionRaceOrder.id, eventId: event.id,
      orderItemId: collectionRaceLine.id, collectorId: owner.id, qty: 1, clientActionId: randomUUID() }),
  ])
  assert.equal(collectionRaceResults.filter((result) => result.status === 'fulfilled' && result.value.status === 'COLLECTED').length, 1,
    'Only one distinct action may collect the final unit')
  assert.equal((await db.souvenirOrderItem.findUniqueOrThrow({ where: { id: collectionRaceLine.id } })).collectedQty, 1)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: collectionRaceProduct.id } })).stockFulfilled, 1)
  assert.equal(await db.souvenirCollection.count({ where: { orderItemId: collectionRaceLine.id } }), 1)
  assert.equal(await db.ticket.count({ where: { orderId: collectionRaceOrder.id } }), 0)
  console.log('PASS: competing final-unit pickup actions cannot double-collect or create duplicate audit rows')


  const paidTicket = await db.ticketType.create({ data: {
    orgId: org.id, eventId: event.id, name: 'Synthetic Paid Admission',
    priceMinor: 2500, quota: 3, perBuyerLimit: 3,
  } })
  const mixedProduct = await db.eventSouvenirProduct.create({ data: {
    eventId: event.id, name: 'Synthetic Bag', sku: `QA-BAG-${tag}`, priceMinor: 3000, stockTotal: 2,
  } })
  const mixed = await createOrder({ ...buyer, userId: owner.id,
    items: [{ ticketTypeId: paidTicket.id, qty: 1 }], souvenirs: qty(mixedProduct.id, 1),
  })
  assert.equal(mixed.totalMinor, 5500)
  const mixedOrder = await db.order.findUniqueOrThrow({ where: { reference: mixed.orderReference } })
  const mixedPayment = await db.paymentAttempt.create({ data: {
    orderId: mixedOrder.id, reference: `QA-MIX-${tag.toUpperCase()}`, provider: 'SIMULATOR',
    status: 'SUCCESS', amountMinor: 5500,
  } })
  const mixedOutcome = await fulfilPaidOrder({ orderId: mixedOrder.id, paymentAttemptId: mixedPayment.id, amountMinor: 5500 })
  assert.equal(mixedOutcome.outcome, 'FULFILLED')
  assert.equal(await db.ticket.count({ where: { orderId: mixedOrder.id, status: 'VALID' } }), 1)
  assert.equal((await db.souvenirOrderItem.findFirstOrThrow({ where: { orderId: mixedOrder.id } })).holdStatus, 'CONSUMED')
  assert.equal(await db.invoice.count({ where: { orderId: mixedOrder.id, status: 'PAID' } }), 1)
  console.log('PASS: one verified combined order produces one admission ticket, one souvenir entitlement and one paid receipt')

  const freeTicket = await db.ticketType.create({ data: {
    orgId: org.id, eventId: event.id, name: 'Synthetic Free RSVP', priceMinor: 0, quota: 5,
  } })
  const free = await createOrder({ ...buyer, items: [{ ticketTypeId: freeTicket.id, qty: 1 }], souvenirs: [] })
  assert.equal(free.kind, 'FREE')
  const freeOrder = await db.order.findUniqueOrThrow({ where: { reference: free.orderReference } })
  await fulfilFreeOrder(freeOrder.id)
  assert.equal(await db.ticket.count({ where: { orderId: freeOrder.id, status: 'VALID' } }), 1)
  assert.equal(await db.souvenirOrderItem.count({ where: { orderId: freeOrder.id } }), 0)
  console.log('PASS: existing free RSVP still issues a ticket with no merchandise charge')

  const cap = await db.eventSouvenirProduct.create({ data: { eventId: event.id, name: 'Synthetic Cap', sku: `QA-CAP-${tag}`, priceMinor: 2000, stockTotal: 1 } })
  const raced = await Promise.allSettled([
    createOrder({ ...buyer, buyerEmail: `qa-race-a-${tag}@example.invalid`, souvenirs: qty(cap.id, 1) }),
    createOrder({ ...buyer, buyerEmail: `qa-race-b-${tag}@example.invalid`, souvenirs: qty(cap.id, 1) }),
  ])
  const success = raced.filter((r) => r.status === 'fulfilled')
  assert.equal(success.length, 1, 'Only one customer can reserve the last cap')
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: cap.id } })).stockReserved, 1)
  console.log('PASS: competing simultaneous checkouts cannot sell the last cap twice')

  const heldOrder = await db.order.findUniqueOrThrow({ where: { reference: (success[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>).value.orderReference } })
  await db.order.update({ where: { id: heldOrder.id }, data: { expiresAt: new Date(Date.now() - 60_000) } })
  const expiry = await releaseExpiredReservations()
  assert.ok(expiry.released >= 1)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: cap.id } })).stockReserved, 0)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: heldOrder.id } })).status, 'EXPIRED')
  console.log('PASS: unpaid expired reservation returns physical stock without touching paid entitlements')

  // Late paid mixed order: expired hold gets released, a competing customer
  // purchases the last SKU, then the late provider result must create a refund
  // case AND release any ticket hold re-acquired during the failed fulfilment.
  const scarce = await db.eventSouvenirProduct.create({ data: {
    eventId: event.id, name: 'Synthetic Last-SKU Sticker', sku: `QA-RARE-${tag}`, priceMinor: 3200, stockTotal: 1,
  } })
  const lateTicket = await db.ticketType.create({ data: {
    orgId: org.id, eventId: event.id, name: 'Late-payment test admission', priceMinor: 1300, quota: 3,
  } })
  const lateOrderResult = await createOrder({ ...buyer, buyerEmail: `qa-late-${tag}@example.invalid`,
    items: [{ ticketTypeId: lateTicket.id, qty: 1 }], souvenirs: qty(scarce.id, 1),
  })
  const lateOrder = await db.order.findUniqueOrThrow({ where: { reference: lateOrderResult.orderReference } })
  await db.order.update({ where: { id: lateOrder.id }, data: { expiresAt: new Date(Date.now() - 90_000) } })
  await db.inventoryReservation.updateMany({ where: { orderId: lateOrder.id }, data: { expiresAt: new Date(Date.now() - 90_000) } })
  await releaseExpiredReservations()
  const rival = await createOrder({ ...buyer, buyerEmail: `qa-rival-${tag}@example.invalid`,
    souvenirs: qty(scarce.id, 1),
  })
  const rivalOrder = await db.order.findUniqueOrThrow({ where: { reference: rival.orderReference } })
  const rivalAttempt = await db.paymentAttempt.create({ data: {
    orderId: rivalOrder.id, reference: `QA-RIVAL-${tag.toUpperCase()}`, provider: 'SIMULATOR', status: 'SUCCESS', amountMinor: rival.totalMinor,
  } })
  assert.equal((await fulfilPaidOrder({ orderId: rivalOrder.id, paymentAttemptId: rivalAttempt.id, amountMinor: rival.totalMinor })).outcome, 'FULFILLED')
  const lateAttempt = await db.paymentAttempt.create({ data: {
    orderId: lateOrder.id, reference: `QA-LATE-${tag.toUpperCase()}`, provider: 'SIMULATOR', status: 'SUCCESS', amountMinor: lateOrderResult.totalMinor,
  } })
  const exceptionOutcome = await fulfilPaidOrder({ orderId: lateOrder.id, paymentAttemptId: lateAttempt.id, amountMinor: lateOrderResult.totalMinor })
  assert.equal(exceptionOutcome.outcome, 'EXCEPTION_CAPACITY')
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: lateOrder.id } })).status, 'EXCEPTION_REVIEW')
  assert.equal(await db.refundCase.count({ where: { orderId: lateOrder.id, status: 'REQUESTED' } }), 1)
  assert.equal(await db.ticket.count({ where: { orderId: lateOrder.id } }), 0)
  assert.equal(await db.invoice.count({ where: { orderId: lateOrder.id } }), 0)
  assert.equal((await db.ticketType.findUniqueOrThrow({ where: { id: lateTicket.id } })).reservedCount, 0)
  assert.equal((await db.eventSouvenirProduct.findUniqueOrThrow({ where: { id: scarce.id } })).stockSold, 1)
  console.log('PASS: late paid order with exhausted SKU enters refund review without stranding a re-reserved admission seat')

  console.log('MERCHANDISE ISOLATED QA: ALL ASSERTIONS PASSED — NO REAL MONEY OR CUSTOMER DATA')
}
main().catch((error) => { console.error('MERCHANDISE ISOLATED QA FAILED', error instanceof Error ? error.message : 'Unknown'); process.exitCode=1 })
  .finally(async () => { await db.$disconnect() })
