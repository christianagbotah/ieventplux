import { db } from '../../lib/db'
import { errors } from '../api'
import { verifyTicketSignature } from '../qr'
import { isSameScanContext, isSameScanCredential, validClientScanId, validCaptureTime } from './checkin-idempotency'

/**
 * Venue check-in: online scanning, manual lookup, offline sync with preserved
 * conflicts (never silently discarded), duplicate detection and stats.
 */

export interface ScanRequest {
  eventId: string
  scannerId: string
  payload: string // QR payload "IEVX1.<ticketId>.<sig>" or plain ticket code
  deviceSessionId?: string | null
  clientScanId: string
  source?: 'ONLINE' | 'OFFLINE_SYNC'
  capturedOfflineAt?: string | null
}

export interface ScanResult {
  result: 'ADMITTED' | 'DUPLICATE' | 'INVALID' | 'CONFLICT'
  ticket?: { code: string; holderName: string; ticketType: string; checkedInAt: string | null }
  detail: string
}

/**
 * The unique scan identifier is a retry key, not an authorization token.
 * Recheck staff, event, and the ticket credential before replaying a result.
 */
async function replayStoredScan(req: ScanRequest, existing: {
  eventId: string
  scannerId: string
  ticketId: string
  result: string
}): Promise<ScanResult> {
  if (!isSameScanContext(existing, req)) {
    throw errors.conflict('Scan identifier is already in use. Start a fresh scan.')
  }
  const ticket = await db.ticket.findUnique({
    where: { id: existing.ticketId },
    include: { ticketType: true },
  })
  if (!ticket || !isSameScanCredential(req.payload, ticket, verifyTicketSignature)) {
    throw errors.conflict('Scan identifier is already in use. Start a fresh scan.')
  }
  return {
    result: existing.result as ScanResult['result'],
    ticket: {
      code: ticket.code,
      holderName: ticket.holderName,
      ticketType: ticket.ticketType.name,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    },
    detail: 'Previously processed scan — original result returned without a new admission.',
  }
}

/** PostgreSQL unique index on clientScanId serializes simultaneous replays. */
function isUniqueScanCollision(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'P2002'
}

export async function processScan(req: ScanRequest): Promise<ScanResult> {
  if (!validClientScanId(req.clientScanId)) throw errors.badRequest('Invalid client scan identifier.')
  if (!req.payload.trim() || req.payload.length > 2048) throw errors.badRequest('Invalid ticket scan payload.')
  if (!validCaptureTime(req.capturedOfflineAt ?? undefined)) throw errors.badRequest('Invalid offline scan timestamp.')

  const existing = await db.admissionScan.findUnique({ where: { clientScanId: req.clientScanId } })
  if (existing) return replayStoredScan(req, existing)

  let ticketId: string | null = null
  const trimmed = req.payload.trim()
  if (trimmed.startsWith('IEVX1.')) {
    const parts = trimmed.split('.')
    if (parts.length === 3) {
      const [prefix, id, sig] = parts
      void prefix
      ticketId = id
      const ticket = await db.ticket.findUnique({ where: { id } })
      if (!ticket || !verifyTicketSignature(id, ticket.code, sig)) {
        return { result: 'INVALID', detail: 'Invalid ticket credential.' }
      }
    } else {
      return { result: 'INVALID', detail: 'Malformed QR payload.' }
    }
  } else {
    const byCode = await db.ticket.findUnique({ where: { code: trimmed.toUpperCase() } })
    ticketId = byCode?.id ?? null
    if (!ticketId) {
      return { result: 'INVALID', detail: 'Ticket not found.' }
    }
  }

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { ticketType: true } })
  if (!ticket) return { result: 'INVALID', detail: 'Ticket not found.' }
  if (ticket.eventId !== req.eventId) {
    await db.admissionScan.create({
      data: { ticketId: ticket.id, eventId: req.eventId, scannerId: req.scannerId, deviceSessionId: req.deviceSessionId ?? null, result: 'INVALID', source: req.source ?? 'ONLINE', clientScanId: req.clientScanId, note: 'Ticket belongs to another event' },
    })
    return { result: 'INVALID', detail: 'This ticket belongs to a different event.' }
  }

  // The admission decision is made *inside the database*, not from the
  // earlier ticket snapshot. Two concurrent scanners can both read VALID,
  // but only one may successfully change VALID -> CHECKED_IN.
  try {
    return await db.$transaction(async (tx): Promise<ScanResult> => {
      const admittedAt = new Date()
      const changed = await tx.ticket.updateMany({
        where: { id: ticket.id, eventId: req.eventId, status: 'VALID' },
        data: { status: 'CHECKED_IN', checkedInAt: admittedAt, checkedInBy: req.scannerId },
      })

      if (changed.count === 1) {
        await tx.admissionScan.create({
          data: {
            ticketId: ticket.id,
            eventId: req.eventId,
            scannerId: req.scannerId,
            deviceSessionId: req.deviceSessionId ?? null,
            result: 'ADMITTED',
            source: req.source ?? 'ONLINE',
            clientScanId: req.clientScanId,
            capturedOfflineAt: req.capturedOfflineAt ? new Date(req.capturedOfflineAt) : null,
          },
        })
        return {
          result: 'ADMITTED',
          ticket: {
            code: ticket.code, holderName: ticket.holderName,
            ticketType: ticket.ticketType.name, checkedInAt: admittedAt.toISOString(),
          },
          detail: 'Admitted.',
        }
      }

      // A concurrent admission/refund/revocation won the row lock, or the
      // ticket was already ineligible. Re-read inside the same transaction:
      // never overwrite the winner's checkedInAt/checkedInBy.
      const current = await tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: { status: true, checkedInAt: true },
      })
      const alreadyAdmitted = current.status === 'CHECKED_IN'
      const conflict = alreadyAdmitted && req.source === 'OFFLINE_SYNC'
      const outcome = alreadyAdmitted ? (conflict ? 'CONFLICT' : 'DUPLICATE') : 'INVALID'
      await tx.admissionScan.create({
        data: {
          ticketId: ticket.id,
          eventId: req.eventId,
          scannerId: req.scannerId,
          deviceSessionId: req.deviceSessionId ?? null,
          result: outcome,
          source: req.source ?? 'ONLINE',
          clientScanId: req.clientScanId,
          capturedOfflineAt: req.capturedOfflineAt ? new Date(req.capturedOfflineAt) : null,
          note: alreadyAdmitted
            ? conflict
              ? 'Offline scan conflicts with earlier admission; preserved for review'
              : 'Duplicate scan; already admitted'
            : 'Ticket status ' + current.status,
        },
      })
      if (!alreadyAdmitted) {
        return {
          result: 'INVALID',
          detail: 'Ticket is ' + current.status.toLowerCase().replaceAll('_', ' ') + ' and cannot be admitted.',
        }
      }
      return {
        result: outcome,
        ticket: {
          code: ticket.code, holderName: ticket.holderName,
          ticketType: ticket.ticketType.name,
          checkedInAt: current.checkedInAt?.toISOString() ?? null,
        },
        detail: conflict
          ? 'Offline scan conflicts with an earlier admission. Scan recorded for review.'
          : 'This ticket was already admitted.',
      }
    }, { maxWait: 5_000, timeout: 15_000 })
  } catch (error) {
    // If two requests race with the SAME idempotency ID, one may lose the
    // unique index race. Its transaction rolls back (including the ticket
    // change), then a verified lookup returns only the winning result.
    if (isUniqueScanCollision(error)) {
      const committed = await db.admissionScan.findUnique({
        where: { clientScanId: req.clientScanId },
      })
      if (committed) return replayStoredScan(req, committed)
    }
    throw error
  }
}

export async function manualLookup(eventId: string, query: string) {
  const q = query.trim()
  if (q.length < 2) throw errors.badRequest('Enter at least 2 characters.')
  const tickets = await db.ticket.findMany({
    where: {
      eventId,
      OR: [{ code: { contains: q.toUpperCase() } }, { holderName: { contains: q } }, { holderEmail: { contains: q.toLowerCase() } }],
    },
    include: { ticketType: true },
    take: 25,
    orderBy: { issuedAt: 'desc' },
  })
  return tickets.map((t) => ({
    id: t.id,
    code: t.code,
    holderName: t.holderName,
    ticketType: t.ticketType.name,
    status: t.status,
    checkedInAt: t.checkedInAt?.toISOString() ?? null,
  }))
}

export async function checkinStats(eventId: string) {
  const [total, admitted, byType, conflicts] = await Promise.all([
    db.ticket.count({ where: { eventId, status: { in: ['VALID', 'CHECKED_IN', 'REFUNDED', 'REVOKED'] } } }),
    db.ticket.count({ where: { eventId, status: 'CHECKED_IN' } }),
    db.ticket.groupBy({ by: ['ticketTypeId'], where: { eventId }, _count: true }),
    db.admissionScan.count({ where: { eventId, result: { in: ['DUPLICATE', 'CONFLICT', 'INVALID'] } } }),
  ])
  const typeIds = byType.map((b) => b.ticketTypeId)
  const types = await db.ticketType.findMany({ where: { id: { in: typeIds } } })
  return {
    ticketsIssued: total,
    admitted,
    remaining: Math.max(0, total - admitted),
    anomalies: conflicts,
    byType: byType.map((b) => ({ name: types.find((t) => t.id === b.ticketTypeId)?.name ?? '—', count: b._count })),
  }
}
