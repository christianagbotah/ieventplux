/**
 * Concurrent admission acceptance on CI's disposable local seeded database.
 * Creates only synthetic tickets. Never scans, changes or charges real tickets.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { processScan } from '../src/server/services/checkin'

const url = process.env.DATABASE_URL ?? ''
if (process.env.NODE_ENV === 'production' ||
  !/^postgres(?:ql)?:\/\/(?:[^@]+@)?(?:localhost|127\.0\.0\.1):\d+\//.test(url)) {
  throw new Error('Concurrent scan acceptance requires a local disposable PostgreSQL CI database.')
}

const assert = (condition: unknown, msg: string) => {
  if (!condition) throw new Error(msg)
  console.log('PASS ' + msg)
}

async function run() {
  const tt = await db.ticketType.findFirstOrThrow({ select: { id: true, eventId: true } })
  const staff = await db.user.findMany({ select: { id: true }, take: 2 })
  if (staff.length !== 2) throw new Error('CI needs two synthetic scanner identities.')
  const ticketIds: string[] = []
  async function newTicket() {
    const ticket = await db.ticket.create({
      data: {
        eventId: tt.eventId, ticketTypeId: tt.id,
        code: 'TKT-QA-' + randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
        qrSecret: 'synthetic-nonredeemable', holderName: 'Synthetic concurrency test, not an attendee',
        status: 'VALID',
      },
      select: { id: true, code: true, eventId: true },
    })
    ticketIds.push(ticket.id)
    return ticket
  }
  try {
    const ticket = await newTicket()
    const requests = [
      { eventId: ticket.eventId, scannerId: staff[0].id, payload: ticket.code,
        clientScanId: 'qa-atomic-' + randomUUID(), source: 'ONLINE' as const },
      { eventId: ticket.eventId, scannerId: staff[1].id, payload: ticket.code,
        clientScanId: 'qa-atomic-' + randomUUID(), source: 'OFFLINE_SYNC' as const,
        capturedOfflineAt: new Date(Date.now() - 30000).toISOString() },
    ]
    const outcomes = await Promise.all(requests.map(processScan))
    const winner = outcomes.findIndex(row => row.result === 'ADMITTED')
    assert(winner >= 0 && outcomes.filter(row => row.result === 'ADMITTED').length === 1 &&
      outcomes.filter(row => row.result === 'CONFLICT' || row.result === 'DUPLICATE').length === 1,
      'two scanners produce exactly one admission, plus a duplicate/conflict')

    const saved = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    assert(saved.status === 'CHECKED_IN' && saved.checkedInBy === requests[winner].scannerId &&
      saved.checkedInAt instanceof Date,
      'winning scanner retains original check-in timestamp and identity')
    const audit = await db.admissionScan.findMany({ where: { ticketId: ticket.id } })
    assert(audit.length === 2 && audit.filter(row => row.result === 'ADMITTED').length === 1,
      'only one ADMITTED audit record, losing attempt preserved')
    const retries = await Promise.all(requests.map(processScan))
    assert(retries.every((item,i) => item.result === outcomes[i].result) &&
      (await db.admissionScan.count({ where: { ticketId: ticket.id } })) === 2,
      'idempotent retries reuse original outcomes with no new scans')

    const same = await newTicket()
    const sameRequest = {
      eventId: same.eventId, scannerId: staff[0].id, payload: same.code,
      clientScanId: 'qa-sameid-' + randomUUID(), source: 'ONLINE' as const,
    }
    const two = await Promise.all([processScan(sameRequest), processScan(sameRequest)])
    assert(two.every(row => row.result === 'ADMITTED') &&
      (await db.admissionScan.count({ where: { ticketId: same.id } })) === 1,
      'simultaneous same-ID retries return one committed admission')

    const refundTicket = await newTicket()
    const scan = {
      eventId: refundTicket.eventId, scannerId: staff[0].id, payload: refundTicket.code,
      clientScanId: 'qa-refund-' + randomUUID(), source: 'ONLINE' as const,
    }
    const [admission, refund] = await Promise.all([
      processScan(scan),
      db.ticket.updateMany({
        where: { id: refundTicket.id, status: 'VALID' },
        data: { status: 'REFUNDED' },
      }),
    ])
    const state = await db.ticket.findUniqueOrThrow({ where: { id: refundTicket.id } })
    assert(
      (admission.result === 'ADMITTED' && state.status === 'CHECKED_IN' && refund.count === 0) ||
      (admission.result === 'INVALID' && state.status === 'REFUNDED' && refund.count === 1),
      'competing refund and admission cannot each claim a VALID ticket')
  } finally {
    for (const ticketId of ticketIds.reverse()) {
      await db.admissionScan.deleteMany({ where: { ticketId } })
      await db.ticket.delete({ where: { id: ticketId } })
    }
  }
}

try { await run() } finally { await db.$disconnect() }
