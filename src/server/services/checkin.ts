import { db } from '../../lib/db'
import { errors } from '../api'
import { verifyTicketSignature } from '../qr'

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

export async function processScan(req: ScanRequest): Promise<ScanResult> {
  const existing = await db.admissionScan.findUnique({ where: { clientScanId: req.clientScanId } })
  if (existing) {
    const ticket = await db.ticket.findUnique({ where: { id: existing.ticketId }, include: { ticketType: true } })
    return {
      result: existing.result as ScanResult['result'],
      ticket: ticket ? { code: ticket.code, holderName: ticket.holderName, ticketType: ticket.ticketType.name, checkedInAt: ticket.checkedInAt?.toISOString() ?? null } : undefined,
      detail: 'Duplicate scan submission (same client scan id) — original result returned.',
    }
  }

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

  if (ticket.status === 'CHECKED_IN') {
    const isConflict = req.source === 'OFFLINE_SYNC'
    await db.admissionScan.create({
      data: {
        ticketId: ticket.id,
        eventId: req.eventId,
        scannerId: req.scannerId,
        deviceSessionId: req.deviceSessionId ?? null,
        result: isConflict ? 'CONFLICT' : 'DUPLICATE',
        source: req.source ?? 'ONLINE',
        clientScanId: req.clientScanId,
        capturedOfflineAt: req.capturedOfflineAt ? new Date(req.capturedOfflineAt) : null,
        note: isConflict ? 'Offline scan conflicts with an earlier online admission — preserved for review' : 'Duplicate scan',
      },
    })
    return {
      result: isConflict ? 'CONFLICT' : 'DUPLICATE',
      ticket: { code: ticket.code, holderName: ticket.holderName, ticketType: ticket.ticketType.name, checkedInAt: ticket.checkedInAt?.toISOString() ?? null },
      detail: isConflict
        ? `Conflict preserved: already admitted at ${ticket.checkedInAt?.toLocaleString()}. Offline scan kept for review.`
        : `Already admitted at ${ticket.checkedInAt?.toLocaleString()}.`,
    }
  }

  if (ticket.status !== 'VALID') {
    await db.admissionScan.create({
      data: { ticketId: ticket.id, eventId: req.eventId, scannerId: req.scannerId, deviceSessionId: req.deviceSessionId ?? null, result: 'INVALID', source: req.source ?? 'ONLINE', clientScanId: req.clientScanId, note: `Ticket status ${ticket.status}` },
    })
    return { result: 'INVALID', detail: `Ticket is ${ticket.status.toLowerCase().replace('_', ' ')} and cannot be admitted.` }
  }

  await db.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkedInBy: req.scannerId } })
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
  })

  return {
    result: 'ADMITTED',
    ticket: { code: ticket.code, holderName: ticket.holderName, ticketType: ticket.ticketType.name, checkedInAt: new Date().toISOString() },
    detail: 'Admitted.',
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
