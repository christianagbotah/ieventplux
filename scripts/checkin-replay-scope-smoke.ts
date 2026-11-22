/**
 * Synthetic DEV-seed-only replay isolation. Creates a temporary AdmissionScan;
 * never admits a ticket, sends payment or changes ticket status.
 */
import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { ApiError } from '../src/server/api'
import { processScan } from '../src/server/services/checkin'

if (process.env.NODE_ENV === 'production') {
  throw new Error('Scan isolation regression is forbidden in production.')
}

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
  console.log('PASS ' + message)
}

async function mustConflict(task: () => Promise<unknown>, message: string) {
  try {
    await task()
    throw new Error('Unauthorized scan replay was unexpectedly allowed: ' + message)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error
    console.log('PASS ' + message)
  }
}

async function run() {
  const ticket = await db.ticket.findFirstOrThrow({
    where: { status: { in: ['VALID', 'CHECKED_IN'] } },
    select: { id: true, eventId: true, code: true, status: true },
  })
  const original = await db.user.findFirstOrThrow({ select: { id: true } })
  const anotherUser = await db.user.findFirstOrThrow({ where: { id: { not: original.id } }, select: { id: true } })
  const anotherEvent = await db.event.findFirstOrThrow({ where: { id: { not: ticket.eventId } }, select: { id: true } })
  const clientScanId = 'qa-checkin-' + randomUUID()
  const scan = await db.admissionScan.create({
    data: {
      eventId: ticket.eventId, ticketId: ticket.id, scannerId: original.id, clientScanId,
      result: 'DUPLICATE', source: 'ONLINE',
      note: 'Temporary CI replay-scope regression; no admission was made',
    },
  })
  try {
    const request = {
      eventId: ticket.eventId, scannerId: original.id, clientScanId,
      payload: ticket.code, source: 'ONLINE' as const,
    }
    const replay = await processScan(request)
    assert(replay.result === 'DUPLICATE' && replay.ticket?.code === ticket.code,
      'matching event, scanner and ticket safely recovers the original scan')
    await mustConflict(() => processScan({ ...request, eventId: anotherEvent.id }),
      'same ID from another event cannot disclose ticket holder')
    await mustConflict(() => processScan({ ...request, scannerId: anotherUser.id }),
      'same ID from another staff account cannot disclose ticket holder')
    await mustConflict(() => processScan({ ...request, payload: 'TKT-OTHER-CREDENTIAL' }),
      'same scan ID with another ticket credential cannot disclose ticket holder')
    const unchanged = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true } })
    assert(unchanged.status === ticket.status, 'replay test makes no admission or ticket status change')
  } finally {
    await db.admissionScan.delete({ where: { id: scan.id } })
  }
}

try { await run() } finally { await db.$disconnect() }
