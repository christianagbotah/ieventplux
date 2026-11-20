import { db } from '@/lib/db'
import { checkinStats } from './checkin'
import { groupedRecentScanCounts, type AdmissionOperations, type AdmissionScanResult } from '@/portal/lib/admission-operations'

/** One tenant-scoped server-side snapshot; caller has already passed checkin:scan.
 * Monitoring NEVER returns ticket identifiers, QR contents, holder info,
 * device tokens, or token hashes.
 */
export async function checkinOperations(eventId: string): Promise<AdmissionOperations> {
  const asOf = new Date()
  const since = new Date(asOf.getTime() - 15 * 60_000)
  const [totals, validToAdmit, resultGroups, staffGroups, alerts, sessions] = await Promise.all([
    checkinStats(eventId),
    db.ticket.count({ where: { eventId, status: 'VALID' } }),
    db.admissionScan.groupBy({
      by: ['result'], where: { eventId, scannedAt: { gte: since } }, _count: { _all: true },
    }),
    db.admissionScan.groupBy({
      by: ['scannerId'], where: { eventId, scannedAt: { gte: since } },
      _count: { _all: true }, _max: { scannedAt: true },
    }),
    db.admissionScan.findMany({
      where: { eventId, result: { in: ['DUPLICATE', 'CONFLICT', 'INVALID'] } },
      orderBy: { scannedAt: 'desc' }, take: 8,
      select: { id: true, result: true, scannedAt: true, source: true, scannerId: true },
    }),
    db.deviceSession.findMany({
      where: { eventId }, orderBy: { createdAt: 'desc' }, take: 12,
      select: { id: true, name: true, userId: true, createdAt: true, lastSyncAt: true, revokedAt: true },
    }),
  ])
  const userIds = [...new Set([
    ...staffGroups.map(row => row.scannerId),
    ...alerts.map(row => row.scannerId),
    ...sessions.map(row => row.userId),
  ])]
  const staff = await db.user.findMany({
    where: { id: { in: userIds } }, select: { id: true, displayName: true },
  })
  const staffNames = new Map(staff.map(row => [row.id, row.displayName]))
  return {
    eventId, asOf: asOf.toISOString(),
    totals: {
      ticketsIssued: totals.ticketsIssued, admitted: totals.admitted,
      remaining: totals.remaining, validToAdmit, anomalies: totals.anomalies,
    },
    recent15Min: groupedRecentScanCounts(resultGroups.map(row => ({ result: row.result, count: row._count._all }))),
    scanners: staffGroups
      .filter(row => row._max.scannedAt !== null)
      .sort((a,b) => (b._max.scannedAt?.getTime() ?? 0) - (a._max.scannedAt?.getTime() ?? 0))
      .slice(0, 8)
      .map(row => ({
        userId: row.scannerId,
        name: staffNames.get(row.scannerId) ?? 'Event staff',
        attempts15Min: row._count._all,
        lastScanAt: row._max.scannedAt!.toISOString(),
      })),
    devices: sessions.map(row => ({
      id: row.id,
      name: row.name?.trim() || 'Registered scanner',
      staffName: staffNames.get(row.userId) ?? 'Event staff',
      createdAt: row.createdAt.toISOString(),
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      revoked: row.revokedAt !== null,
    })),
    alerts: alerts.map(row => ({
      id: row.id,
      result: row.result as AdmissionScanResult,
      scannedAt: row.scannedAt.toISOString(),
      source: row.source === 'OFFLINE_SYNC' ? 'OFFLINE_SYNC' as const : 'ONLINE' as const,
      staffName: staffNames.get(row.scannerId) ?? 'Event staff',
    })),
  }
}
